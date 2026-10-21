package pe.altoque.cotizacion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.altoque.catalogo.Cliente;
import pe.altoque.catalogo.ClienteRepository;
import pe.altoque.common.ApiException;
import pe.altoque.common.Catalogos;
import pe.altoque.common.Tokens;
import pe.altoque.comprobante.Comprobante;
import pe.altoque.comprobante.Comprobante.FormaPago;
import pe.altoque.comprobante.ComprobanteDetalle;
import pe.altoque.comprobante.ComprobanteDtos.ClienteIn;
import pe.altoque.comprobante.ComprobanteDtos.EmitirRequest;
import pe.altoque.comprobante.ComprobanteDtos.ItemIn;
import pe.altoque.comprobante.ComprobanteDtos.PagoIn;
import pe.altoque.comprobante.ComprobanteService;
import pe.altoque.comprobante.TipoComprobante;
import pe.altoque.empresa.Empresa;
import pe.altoque.empresa.EmpresaRepository;
import pe.altoque.seguridad.Sesion;
import pe.altoque.usuario.UsuarioRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Cotizaciones: crear, compartir, aceptar o rechazar, y convertir en boleta o factura. */
@Service
public class CotizacionService {

    public record CotizacionRequest(
            @Valid ClienteIn cliente,
            @NotEmpty(message = "Agrega al menos un producto") @Valid List<ItemIn> items,
            /** Días que vale el precio ofrecido. */
            @Min(1) @Max(90) Integer diasValidez,
            @Size(max = 500) String observaciones) {}

    /** Al convertirla en comprobante: qué emitir y cómo se pagó. */
    public record FacturarRequest(@NotNull TipoComprobante tipo, Long serieId, FormaPago formaPago,
                                  @Valid List<PagoIn> pagos, LocalDate fechaVencimiento) {}

    public record ItemVista(int item, Long productoId, String codigo, String descripcion, String unidadMedida,
                            BigDecimal cantidad, BigDecimal precioUnitario, String tipoAfectacion, boolean icbper,
                            BigDecimal total) {}

    public record Vista(Long id, String numero, Cotizacion.Estado estado, boolean vencida, LocalDate fechaEmision,
                        LocalDate validaHasta, String clienteTipoDoc, String clienteNumDoc, String clienteNombre,
                        String clienteDireccion, String clienteEmail, String clienteTelefono, String moneda,
                        BigDecimal totalGravado, BigDecimal totalExonerado, BigDecimal totalInafecto, BigDecimal totalIgv,
                        BigDecimal totalIcbper, BigDecimal total, String observaciones, Long comprobanteId,
                        String comprobanteNumero, String tokenPublico, String vendedor, String empresaNombre,
                        String empresaRuc, String empresaDireccion, String empresaTelefono, List<ItemVista> items,
                        Instant createdAt) {}

    private final CotizacionRepository cotizaciones;
    private final EmpresaRepository empresas;
    private final UsuarioRepository usuarios;
    private final ClienteRepository clientes;
    private final ComprobanteService comprobantes;

    public CotizacionService(CotizacionRepository cotizaciones, EmpresaRepository empresas, UsuarioRepository usuarios,
                             ClienteRepository clientes, ComprobanteService comprobantes) {
        this.cotizaciones = cotizaciones;
        this.empresas = empresas;
        this.usuarios = usuarios;
        this.clientes = clientes;
        this.comprobantes = comprobantes;
    }

    @Transactional(readOnly = true)
    public Page<Vista> listar(Sesion s, int pagina) {
        return cotizaciones.findByEmpresaId(s.empresaId(), PageRequest.of(Math.max(pagina, 0), 30,
                Sort.by(Sort.Direction.DESC, "numero"))).map(this::vista);
    }

    @Transactional(readOnly = true)
    public Vista ver(Sesion s, Long id) {
        return vista(buscar(s, id));
    }

    @Transactional
    public Vista crear(Sesion s, CotizacionRequest req) {
        // Bloquea la empresa: dos cotizaciones a la vez no toman el mismo número.
        Empresa empresa = empresas.bloquear(s.empresaId()).orElseThrow(() -> ApiException.noEncontrado("Empresa"));
        Cotizacion c = new Cotizacion();
        c.setEmpresa(empresa);
        c.setUsuario(usuarios.getReferenceById(s.usuarioId()));
        c.setNumero(cotizaciones.ultimoNumero(empresa.getId()) + 1);
        c.setTokenPublico(Tokens.nuevo(20));
        c.setFechaEmision(LocalDate.now());
        c.setValidaHasta(LocalDate.now().plusDays(req.diasValidez() == null ? 7 : req.diasValidez()));
        c.setObservaciones(limpiar(req.observaciones()));
        asignarCliente(c, s.empresaId(), req.cliente());
        aplicarItems(c, s.empresaId(), req.items());
        return vista(cotizaciones.save(c));
    }

    @Transactional
    public Vista actualizar(Sesion s, Long id, CotizacionRequest req) {
        Cotizacion c = buscar(s, id);
        if (c.getEstado() == Cotizacion.Estado.FACTURADA) {
            throw ApiException.conflicto("Esta cotización ya se facturó; crea una nueva.");
        }
        if (req.diasValidez() != null) c.setValidaHasta(LocalDate.now().plusDays(req.diasValidez()));
        c.setObservaciones(limpiar(req.observaciones()));
        asignarCliente(c, s.empresaId(), req.cliente());
        c.getItems().clear();
        cotizaciones.flush();
        aplicarItems(c, s.empresaId(), req.items());
        c.setEstado(Cotizacion.Estado.ABIERTA);
        return vista(c);
    }

    @Transactional
    public Vista cambiarEstado(Sesion s, Long id, Cotizacion.Estado estado) {
        Cotizacion c = buscar(s, id);
        if (estado == Cotizacion.Estado.FACTURADA) throw ApiException.invalido("Para facturar usa «Convertir en comprobante».");
        if (c.getEstado() == Cotizacion.Estado.FACTURADA) throw ApiException.conflicto("Esta cotización ya se facturó.");
        c.setEstado(estado);
        return vista(c);
    }

    /** Emite la boleta o factura con los mismos productos y precios, y deja la cotización como facturada. */
    @Transactional
    public Comprobante facturar(Sesion s, Long id, FacturarRequest req) {
        Cotizacion c = buscar(s, id);
        if (c.getEstado() == Cotizacion.Estado.FACTURADA) {
            throw ApiException.conflicto("Ya se emitió el comprobante " + c.getComprobante().numeroImpreso() + ".");
        }
        ClienteIn cliente = "0".equals(c.getClienteTipoDoc()) ? null : new ClienteIn(
                c.getCliente() == null ? null : c.getCliente().getId(), c.getClienteTipoDoc(), c.getClienteNumDoc(),
                c.getClienteNombre(), c.getClienteDireccion(), c.getClienteEmail(), c.getClienteTelefono(), false);
        List<ItemIn> items = c.getItems().stream().map(i -> new ItemIn(i.getProducto() == null ? null : i.getProducto().getId(),
                i.getCodigo(), i.getDescripcion(), i.getUnidadMedida(), i.getCantidad(), i.getPrecioUnitario(),
                i.getTipoAfectacion(), i.isIcbper())).toList();
        String obs = "Según cotización " + c.numeroImpreso() + (c.getObservaciones() == null ? "" : ". " + c.getObservaciones());
        Comprobante emitido = comprobantes.emitir(s, new EmitirRequest(req.tipo(), req.serieId(), cliente, items,
                req.formaPago(), null, req.pagos(), req.fechaVencimiento(), null, obs.length() > 500 ? obs.substring(0, 500) : obs));
        c.setComprobante(emitido);
        c.setEstado(Cotizacion.Estado.FACTURADA);
        return emitido;
    }

    // ------------------------------------------------------------------ enlace público

    @Transactional(readOnly = true)
    public Vista publica(String token) {
        return vista(cotizaciones.findByTokenPublico(token).orElseThrow(() -> ApiException.noEncontrado("Cotización")));
    }

    /** El cliente acepta o rechaza desde su enlace. */
    @Transactional
    public Vista responder(String token, boolean acepta) {
        Cotizacion c = cotizaciones.findByTokenPublico(token).orElseThrow(() -> ApiException.noEncontrado("Cotización"));
        if (c.getEstado() != Cotizacion.Estado.ABIERTA) {
            throw ApiException.conflicto("Esta cotización ya fue respondida.");
        }
        if (c.vencida(LocalDate.now())) {
            throw ApiException.conflicto("Esta cotización venció el " + c.getValidaHasta() + ". Pide una nueva.");
        }
        c.setEstado(acepta ? Cotizacion.Estado.ACEPTADA : Cotizacion.Estado.RECHAZADA);
        return vista(c);
    }

    // ------------------------------------------------------------------ apoyo

    private Cotizacion buscar(Sesion s, Long id) {
        return cotizaciones.findByIdAndEmpresaId(id, s.empresaId()).orElseThrow(() -> ApiException.noEncontrado("Cotización"));
    }

    private void aplicarItems(Cotizacion c, Long empresaId, List<ItemIn> items) {
        Comprobante calculo = comprobantes.presupuesto(empresaId, items);
        c.setIgvPorcentaje(calculo.getIgvPorcentaje());
        c.setTotalGravado(calculo.getTotalGravado());
        c.setTotalExonerado(calculo.getTotalExonerado());
        c.setTotalInafecto(calculo.getTotalInafecto());
        c.setTotalIgv(calculo.getTotalIgv());
        c.setTotalIcbper(calculo.getTotalIcbper());
        c.setTotal(calculo.getTotal());
        for (ComprobanteDetalle d : calculo.getDetalles()) {
            Cotizacion.Item i = new Cotizacion.Item();
            i.setCotizacion(c);
            i.setItem(d.getItem());
            i.setProducto(d.getProducto());
            i.setCodigo(d.getCodigo());
            i.setDescripcion(d.getDescripcion());
            i.setUnidadMedida(d.getUnidadMedida());
            i.setCantidad(d.getCantidad());
            i.setPrecioUnitario(d.getPrecioUnitario());
            i.setTipoAfectacion(d.getTipoAfectacion());
            i.setIcbper(d.getIcbper() != null && d.getIcbper().signum() > 0);
            i.setTotal(d.getTotal());
            c.getItems().add(i);
        }
    }

    /** Sin documento queda como «Clientes varios»; si viene, se valida como en la venta. */
    private void asignarCliente(Cotizacion c, Long empresaId, ClienteIn in) {
        Cliente guardado = in != null && in.id() != null
                ? clientes.findByIdAndEmpresaId(in.id(), empresaId).orElseThrow(() -> ApiException.noEncontrado("Cliente")) : null;
        String numero = in == null ? null : in.numeroDocumento() != null && !in.numeroDocumento().isBlank()
                ? in.numeroDocumento().trim() : guardado != null ? guardado.getNumeroDocumento() : null;
        String nombre = in == null ? null : in.nombre() != null && !in.nombre().isBlank()
                ? in.nombre().trim() : guardado != null ? guardado.getNombre() : null;
        if (numero == null) {
            c.setCliente(null);
            c.setClienteTipoDoc("0");
            c.setClienteNumDoc("-");
            c.setClienteNombre(nombre != null ? nombre : "CLIENTES VARIOS");
            c.setClienteEmail(in == null ? null : limpiar(in.email()));
            c.setClienteTelefono(in == null ? null : limpiar(in.telefono()));
            c.setClienteDireccion(null);
            return;
        }
        String tipo = in.tipoDocumento() != null ? in.tipoDocumento() : guardado != null ? guardado.getTipoDocumento() : "1";
        if (!Catalogos.documentoValido(tipo, numero)) {
            throw ApiException.invalido("6".equals(tipo) ? "El RUC no es válido, pe." : "Revisa el documento del cliente.");
        }
        if (nombre == null) throw ApiException.invalido("Falta el nombre o razón social del cliente.");
        c.setCliente(guardado);
        c.setClienteTipoDoc(tipo);
        c.setClienteNumDoc(numero);
        c.setClienteNombre(nombre);
        c.setClienteDireccion(limpiar(in.direccion() != null ? in.direccion() : guardado != null ? guardado.getDireccion() : null));
        c.setClienteEmail(limpiar(in.email() != null ? in.email() : guardado != null ? guardado.getEmail() : null));
        c.setClienteTelefono(limpiar(in.telefono() != null ? in.telefono() : guardado != null ? guardado.getTelefono() : null));
    }

    private Vista vista(Cotizacion c) {
        Empresa e = c.getEmpresa();
        List<ItemVista> items = c.getItems().stream().map(i -> new ItemVista(i.getItem(),
                i.getProducto() == null ? null : i.getProducto().getId(), i.getCodigo(), i.getDescripcion(),
                i.getUnidadMedida(), i.getCantidad(), i.getPrecioUnitario(), i.getTipoAfectacion(), i.isIcbper(),
                i.getTotal())).toList();
        return new Vista(c.getId(), c.numeroImpreso(), c.getEstado(), c.vencida(LocalDate.now()), c.getFechaEmision(),
                c.getValidaHasta(), c.getClienteTipoDoc(), c.getClienteNumDoc(), c.getClienteNombre(),
                c.getClienteDireccion(), c.getClienteEmail(), c.getClienteTelefono(), c.getMoneda(), c.getTotalGravado(),
                c.getTotalExonerado(), c.getTotalInafecto(), c.getTotalIgv(), c.getTotalIcbper(), c.getTotal(),
                c.getObservaciones(), c.getComprobante() == null ? null : c.getComprobante().getId(),
                c.getComprobante() == null ? null : c.getComprobante().numeroImpreso(), c.getTokenPublico(),
                c.getUsuario().getNombre(), e.getNombreComercial() != null ? e.getNombreComercial() : e.getRazonSocial(),
                e.getRuc(), e.getDireccionFiscal(), e.getTelefono(), items, c.getCreatedAt());
    }

    private static String limpiar(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
