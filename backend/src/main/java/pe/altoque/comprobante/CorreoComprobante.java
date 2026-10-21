package pe.altoque.comprobante;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.altoque.common.ApiException;
import pe.altoque.common.Correo;
import pe.altoque.common.Montos;
import pe.altoque.config.AltoqueProperties;
import pe.altoque.seguridad.Sesion;
import pe.altoque.sunat.AlmacenArchivos;
import pe.altoque.sunat.Archivo;
import pe.altoque.sunat.SunatService;

import java.util.ArrayList;
import java.util.List;

/**
 * Envía el comprobante al correo del cliente: un resumen, el enlace para verlo o imprimirlo, y el XML firmado y la
 * constancia de SUNAT (CDR) adjuntos, como hace Odoo al validar una factura.
 */
@Service
public class CorreoComprobante {

    public record Resultado(boolean enviado, String email, String motivo) {}

    private final ComprobanteService comprobantes;
    private final SunatService sunat;
    private final AlmacenArchivos almacen;
    private final Correo correo;
    private final AltoqueProperties props;

    public CorreoComprobante(ComprobanteService comprobantes, SunatService sunat, AlmacenArchivos almacen, Correo correo,
                             AltoqueProperties props) {
        this.comprobantes = comprobantes;
        this.sunat = sunat;
        this.almacen = almacen;
        this.correo = correo;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public Resultado enviar(Sesion s, Long id, String email) {
        Comprobante c = comprobantes.buscar(s, id);
        String para = email != null && !email.isBlank() ? email.trim() : c.getClienteEmail();
        if (para == null || para.isBlank()) {
            return new Resultado(false, null, "El cliente no tiene correo. Compártelo por WhatsApp o escribe un correo.");
        }
        if (!correo.habilitado()) {
            return new Resultado(false, para, "El envío por correo aún no está configurado. Compártelo por WhatsApp.");
        }
        String emisor = c.getEmpresa().getNombreComercial() != null ? c.getEmpresa().getNombreComercial() : c.getEmpresa().getRazonSocial();
        String enlace = props.frontendUrl() + "/c/" + c.getTokenPublico();
        String html = """
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
                  <h2 style="margin:0 0 8px">%s</h2>
                  <p>Hola %s, te enviamos tu <strong>%s %s</strong>.</p>
                  <table style="width:100%%;border-collapse:collapse;margin:16px 0">
                    <tr><td>Fecha</td><td style="text-align:right">%s</td></tr>
                    <tr><td>Total</td><td style="text-align:right;font-size:20px"><strong>%s %s</strong></td></tr>
                  </table>
                  <p><a href="%s" style="display:inline-block;padding:12px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Ver o descargar el comprobante</a></p>
                  <p style="font-size:12px;color:#6b7280">Adjuntamos el XML firmado y la constancia de recepción de SUNAT (CDR). Representación impresa del comprobante electrónico. RUC %s.</p>
                </div>
                """.formatted(escapar(emisor), escapar(c.getClienteNombre()), c.getTipo().nombre().toLowerCase(),
                c.numeroImpreso(), c.getFechaEmision(), "USD".equals(c.getMoneda()) ? "US$" : "S/", Montos.txt(c.getTotal()),
                enlace, c.getEmpresa().getRuc());
        List<Correo.Adjunto> adjuntos = new ArrayList<>();
        try {
            adjuntos.add(new Correo.Adjunto(c.getNombreArchivo() + ".xml", sunat.xmlDe(id), "application/xml"));
        } catch (ApiException e) {
            // Sin XML todavía (no debería pasar): se envía solo el enlace.
        }
        almacen.metaDeComprobante(id, Archivo.Tipo.CDR)
                .ifPresent(a -> adjuntos.add(new Correo.Adjunto(a.getNombre(), almacen.leer(a), "application/zip")));
        boolean ok = correo.enviar(para, c.getTipo().nombre() + " " + c.numeroImpreso() + " · " + emisor, html,
                adjuntos.toArray(Correo.Adjunto[]::new));
        return new Resultado(ok, para, ok ? null : "No se pudo enviar ahora. Inténtalo en un rato o compártelo por WhatsApp.");
    }

    private static String escapar(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
