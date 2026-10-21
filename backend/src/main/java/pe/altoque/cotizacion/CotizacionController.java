package pe.altoque.cotizacion;

import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;
import pe.altoque.comprobante.Comprobante;
import pe.altoque.comprobante.ComprobanteDtos;
import pe.altoque.comprobante.ComprobanteService;
import pe.altoque.cotizacion.CotizacionService.CotizacionRequest;
import pe.altoque.cotizacion.CotizacionService.FacturarRequest;
import pe.altoque.cotizacion.CotizacionService.Vista;
import pe.altoque.seguridad.Sesion;
import pe.altoque.sunat.SunatService;

@RestController
public class CotizacionController {

    private static final Logger log = LoggerFactory.getLogger(CotizacionController.class);

    public record EstadoRequest(Cotizacion.Estado estado) {}

    public record RespuestaCliente(boolean acepta) {}

    private final CotizacionService service;
    private final ComprobanteService comprobantes;
    private final SunatService sunat;

    public CotizacionController(CotizacionService service, ComprobanteService comprobantes, SunatService sunat) {
        this.service = service;
        this.comprobantes = comprobantes;
        this.sunat = sunat;
    }

    @GetMapping("/api/cotizaciones")
    public Page<Vista> listar(@RequestParam(defaultValue = "0") int pagina) {
        return service.listar(Sesion.actual(), pagina);
    }

    @GetMapping("/api/cotizaciones/{id}")
    public Vista ver(@PathVariable Long id) {
        return service.ver(Sesion.actual(), id);
    }

    @PostMapping("/api/cotizaciones")
    public Vista crear(@Valid @RequestBody CotizacionRequest req) {
        return service.crear(Sesion.actual(), req);
    }

    @PutMapping("/api/cotizaciones/{id}")
    public Vista actualizar(@PathVariable Long id, @Valid @RequestBody CotizacionRequest req) {
        return service.actualizar(Sesion.actual(), id, req);
    }

    @PostMapping("/api/cotizaciones/{id}/estado")
    public Vista estado(@PathVariable Long id, @RequestBody EstadoRequest req) {
        return service.cambiarEstado(Sesion.actual(), id, req.estado());
    }

    /** Emite la boleta o factura de la cotización y la envía a SUNAT al toque, como una venta normal. */
    @PostMapping("/api/cotizaciones/{id}/facturar")
    public ComprobanteDtos.Vista facturar(@PathVariable Long id, @Valid @RequestBody FacturarRequest req) {
        Sesion s = Sesion.actual();
        Comprobante c = service.facturar(s, id, req);
        try {
            sunat.enviar(c.getId());
        } catch (Exception e) {
            log.info("Comprobante {} de la cotización {} queda pendiente: {}", c.getId(), id, e.getMessage());
            sunat.anotar(c.getId(), "No se pudo enviar ahora. Lo reintentamos solito.");
        }
        return comprobantes.vista(s, c.getId());
    }

    // ------------------------------------------------------------------ enlace para el cliente

    @GetMapping("/api/public/cotizaciones/{token}")
    public Vista publica(@PathVariable String token) {
        return service.publica(token);
    }

    @PostMapping("/api/public/cotizaciones/{token}/respuesta")
    public Vista responder(@PathVariable String token, @RequestBody RespuestaCliente req) {
        return service.responder(token, req.acepta());
    }
}
