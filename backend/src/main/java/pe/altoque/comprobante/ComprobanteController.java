package pe.altoque.comprobante;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import pe.altoque.common.ApiException;
import pe.altoque.common.Catalogos;
import pe.altoque.common.Montos;
import pe.altoque.comprobante.Comprobante.EstadoPago;
import pe.altoque.comprobante.Comprobante.EstadoSunat;
import pe.altoque.comprobante.ComprobanteDtos.*;
import pe.altoque.seguridad.Sesion;
import pe.altoque.sunat.AlmacenArchivos;
import pe.altoque.sunat.Archivo;
import pe.altoque.sunat.EnvioSunat;
import pe.altoque.sunat.EnvioSunatRepository;
import pe.altoque.sunat.SunatService;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/comprobantes")
public class ComprobanteController {

    private static final Logger log = LoggerFactory.getLogger(ComprobanteController.class);

    private final ComprobanteService service;
    private final SunatService sunat;
    private final AlmacenArchivos almacen;
    private final EnvioSunatRepository envios;
    private final Catalogos catalogos;
    private final CorreoComprobante correo;

    public ComprobanteController(ComprobanteService service, SunatService sunat, AlmacenArchivos almacen,
                                 EnvioSunatRepository envios, Catalogos catalogos, CorreoComprobante correo) {
        this.service = service;
        this.sunat = sunat;
        this.almacen = almacen;
        this.envios = envios;
        this.catalogos = catalogos;
        this.correo = correo;
    }

    @GetMapping
    public Page<Fila> listar(@RequestParam(required = false) String tipo,
                             @RequestParam(required = false) EstadoSunat estado,
                             @RequestParam(required = false) EstadoPago estadoPago,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
                             @RequestParam(required = false) String q,
                             @RequestParam(defaultValue = "0") int pagina,
                             @RequestParam(defaultValue = "20") int tamano) {
        return service.listar(Sesion.actual(), tipo, estado, estadoPago, desde, hasta, q, pagina, tamano);
    }

    @GetMapping("/{id}")
    public Vista ver(@PathVariable Long id) {
        return service.vista(Sesion.actual(), id);
    }

    /** Emite una boleta o factura y la envía a SUNAT al toque. */
    @PostMapping
    public Vista emitir(@Valid @RequestBody EmitirRequest req) {
        Sesion s = Sesion.actual();
        Comprobante c = service.emitir(s, req);
        enviarSinFallar(c.getId());
        // Si el cliente dejó su correo, le llega al toque; si falla, la venta no se afecta.
        if (c.getClienteEmail() != null) correo.enviar(s, c.getId(), null);
        return service.vista(s, c.getId());
    }

    @PostMapping("/{id}/notas")
    public Vista emitirNota(@PathVariable Long id, @Valid @RequestBody NotaRequest req) {
        Sesion s = Sesion.actual();
        Comprobante c = service.emitirNota(s, id, req);
        enviarSinFallar(c.getId());
        return service.vista(s, c.getId());
    }

    @PostMapping("/{id}/reenviar")
    public Vista reenviar(@PathVariable Long id) {
        Sesion s = Sesion.actual();
        Comprobante c = service.buscar(s, id);
        if (c.getEstadoSunat() != EstadoSunat.PENDIENTE) throw ApiException.invalido("Este comprobante ya tiene respuesta de SUNAT.");
        sunat.enviar(id);
        return service.vista(s, id);
    }

    @PostMapping("/{id}/pagos")
    public Vista cobrar(@PathVariable Long id, @Valid @RequestBody PagoIn in) {
        Sesion s = Sesion.actual();
        service.registrarPago(s, id, in);
        return service.vista(s, id);
    }

    @PostMapping("/{id}/anular")
    public Vista anular(@PathVariable Long id, @Valid @RequestBody AnularRequest req) {
        Sesion s = Sesion.actual();
        service.anular(s, id, req.motivo());
        return service.vista(s, id);
    }

    @GetMapping("/{id}/envios")
    public List<EnvioSunat> bitacora(@PathVariable Long id) {
        service.buscar(Sesion.actual(), id);
        return envios.findByComprobanteIdOrderByIdDesc(id);
    }

    public record CorreoRequest(@jakarta.validation.constraints.Email(message = "Correo inválido") String email) {}

    /** Envía (o reenvía) el comprobante al correo del cliente, o a otro que se indique. */
    @PostMapping("/{id}/correo")
    public CorreoComprobante.Resultado correo(@PathVariable Long id, @Valid @RequestBody(required = false) CorreoRequest req) {
        return correo.enviar(Sesion.actual(), id, req == null ? null : req.email());
    }

    @GetMapping("/{id}/xml")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> xml(@PathVariable Long id) {
        Comprobante c = service.buscar(Sesion.actual(), id);
        return descarga(sunat.xmlDe(id), c.getNombreArchivo() + ".xml", MediaType.APPLICATION_XML);
    }

    @GetMapping("/{id}/cdr")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> cdr(@PathVariable Long id) {
        service.buscar(Sesion.actual(), id);
        Archivo a = almacen.metaDeComprobante(id, Archivo.Tipo.CDR).orElseThrow(() -> ApiException.noEncontrado("CDR"));
        return descarga(almacen.leer(a), a.getNombre(), MediaType.parseMediaType("application/zip"));
    }

    /** Registro de ventas en CSV (abre directo en Excel). */
    @GetMapping(value = "/exportar", produces = "text/csv")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> exportar(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        if (desde.isAfter(hasta)) throw ApiException.invalido("La fecha inicial es mayor que la final.");
        StringBuilder csv = new StringBuilder("﻿Fecha;Tipo;Serie;Número;Doc. cliente;Tipo doc.;Cliente;Moneda;Op. gravada;Op. exonerada;Op. inafecta;IGV;ICBPER;Total;Estado SUNAT;Estado pago;Doc. referencia;Detracción\n");
        for (Comprobante c : service.paraExportar(Sesion.actual(), desde, hasta)) {
            boolean negativo = c.getTipo() == TipoComprobante.NOTA_CREDITO;
            csv.append(c.getFechaEmision()).append(';')
                    .append(c.getTipo().codigo()).append(';')
                    .append(c.getSerie()).append(';')
                    .append(c.getCorrelativo()).append(';')
                    .append(c.getClienteNumDoc()).append(';')
                    .append(catalogos.documentos().getOrDefault(c.getClienteTipoDoc(), c.getClienteTipoDoc())).append(';')
                    .append(csvTexto(c.getClienteNombre())).append(';')
                    .append(c.getMoneda()).append(';')
                    .append(monto(c.getTotalGravado(), negativo)).append(';')
                    .append(monto(c.getTotalExonerado(), negativo)).append(';')
                    .append(monto(c.getTotalInafecto(), negativo)).append(';')
                    .append(monto(c.getTotalIgv(), negativo)).append(';')
                    .append(monto(c.getTotalIcbper(), negativo)).append(';')
                    .append(monto(c.getTotal(), negativo)).append(';')
                    .append(c.getEstadoSunat()).append(';')
                    .append(c.getEstadoPago()).append(';')
                    .append(c.getRefSerie() == null ? "" : c.getRefSerie() + "-" + c.getRefCorrelativo()).append(';')
                    .append(c.getDetraccion() == null ? "" : Montos.txt(c.getDetraccion().getMonto()))
                    .append('\n');
        }
        return descarga(csv.toString().getBytes(StandardCharsets.UTF_8), "registro-ventas-%s-a-%s.csv".formatted(desde, hasta),
                MediaType.parseMediaType("text/csv; charset=utf-8"));
    }

    /** XML firmados y CDR del rango en un ZIP (lo que pide el contador a fin de mes). Máximo 31 días por descarga. */
    @GetMapping(value = "/exportar-xml", produces = "application/zip")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> exportarXml(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        if (desde.isAfter(hasta)) throw ApiException.invalido("La fecha inicial es mayor que la final.");
        if (java.time.temporal.ChronoUnit.DAYS.between(desde, hasta) > 31) throw ApiException.invalido("Descarga de a un mes como máximo.");
        var salida = new java.io.ByteArrayOutputStream();
        try (var zip = new java.util.zip.ZipOutputStream(salida)) {
            for (Comprobante c : service.paraExportar(Sesion.actual(), desde, hasta)) {
                for (Archivo.Tipo t : Archivo.Tipo.values()) {
                    var meta = almacen.metaDeComprobante(c.getId(), t);
                    if (meta.isEmpty()) continue;
                    zip.putNextEntry(new java.util.zip.ZipEntry((t == Archivo.Tipo.XML ? "xml/" : "cdr/") + meta.get().getNombre()));
                    zip.write(almacen.leer(meta.get()));
                    zip.closeEntry();
                }
            }
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
        return descarga(salida.toByteArray(), "comprobantes-%s-a-%s.zip".formatted(desde, hasta), MediaType.parseMediaType("application/zip"));
    }

    private void enviarSinFallar(Long id) {
        try {
            sunat.enviar(id);
        } catch (ApiException e) {
            // p. ej. faltan credenciales SOL: el comprobante queda PENDIENTE y el usuario ve el mensaje en el detalle.
            log.info("Comprobante {} queda pendiente: {}", id, e.getMessage());
            sunat.anotar(id, e.getMessage());
        } catch (Exception e) {
            log.warn("Envío a SUNAT falló para {}: {}", id, e.getMessage());
            sunat.anotar(id, "No se pudo enviar ahora. Lo reintentamos solito.");
        }
    }

    private static String monto(java.math.BigDecimal v, boolean negativo) {
        String t = Montos.txt(v);
        return negativo && v.signum() != 0 ? "-" + t : t;
    }

    private static String csvTexto(String s) {
        return s == null ? "" : "\"" + s.replace("\"", "\"\"") + "\"";
    }

    static ResponseEntity<byte[]> descarga(byte[] contenido, String nombre, MediaType tipo) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(nombre, StandardCharsets.UTF_8).build().toString())
                .contentType(tipo)
                .body(contenido);
    }
}
