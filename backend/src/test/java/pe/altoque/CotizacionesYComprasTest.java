package pe.altoque;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import pe.altoque.empresa.Empresa;
import pe.altoque.empresa.EmpresaRepository;

import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** Cotización → aceptación del cliente → factura; compras con crédito fiscal y el IGV a pagar del mes. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CotizacionesYComprasTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper json;
    @Autowired
    EmpresaRepository empresas;

    String token;

    @BeforeEach
    void registrar() throws Exception {
        String ruc = "20487654320";
        if (empresas.existsByRuc(ruc)) {
            token = post("/api/auth/login", Map.of("email", "ventas@ferreteria.pe", "password", "secreto123"), null, 200)
                    .path("token").asText();
            return;
        }
        token = post("/api/auth/registro", Map.of("ruc", ruc, "razonSocial", "Ferretería El Tornillo SAC",
                "direccion", "Av. Grau 300", "nombre", "Luis", "email", "ventas@ferreteria.pe", "password", "secreto123"),
                null, 200).path("token").asText();
        Empresa e = empresas.findByRuc(ruc).orElseThrow();
        e.setAmbienteSunat(Empresa.Ambiente.SIMULADO);
        empresas.save(e);
    }

    @Test
    void unaCotizacionAceptadaSeConvierteEnFactura() throws Exception {
        JsonNode cot = post("/api/cotizaciones", Map.of(
                "cliente", Map.of("tipoDocumento", "6", "numeroDocumento", "20601234565", "nombre", "CONSTRUCTORA ANDINA SAC"),
                "items", new Object[]{
                        Map.of("descripcion", "Cemento Sol x 42.5 kg", "cantidad", 20, "precioUnitario", 29.50),
                        Map.of("descripcion", "Fierro 1/2\"", "cantidad", 10, "precioUnitario", 41.30)},
                "diasValidez", 5), token, 200);
        assertThat(cot.path("numero").asText()).startsWith("COT-");
        assertThat(cot.path("total").decimalValue()).isEqualByComparingTo("1003.00");
        assertThat(cot.path("totalIgv").decimalValue()).isEqualByComparingTo("153.00");
        assertThat(cot.path("estado").asText()).isEqualTo("ABIERTA");

        // El cliente la abre desde su enlace y la acepta.
        String enlace = cot.path("tokenPublico").asText();
        assertThat(leer(mvc.perform(get("/api/public/cotizaciones/" + enlace))).path("empresaRuc").asText()).isEqualTo("20487654320");
        assertThat(post("/api/public/cotizaciones/" + enlace + "/respuesta", Map.of("acepta", true), null, 200)
                .path("estado").asText()).isEqualTo("ACEPTADA");
        post("/api/public/cotizaciones/" + enlace + "/respuesta", Map.of("acepta", false), null, 409);

        JsonNode factura = post("/api/cotizaciones/" + cot.path("id").asLong() + "/facturar", Map.of("tipo", "01",
                "pagos", new Object[]{Map.of("metodo", "TRANSFERENCIA", "monto", 1003.00)}), token, 200);
        assertThat(factura.path("numero").asText()).startsWith("F001-");
        assertThat(factura.path("total").decimalValue()).isEqualByComparingTo("1003.00");
        assertThat(factura.path("observaciones").asText()).contains(cot.path("numero").asText());
        assertThat(obtener("/api/cotizaciones/" + cot.path("id").asLong()).path("estado").asText()).isEqualTo("FACTURADA");
        post("/api/cotizaciones/" + cot.path("id").asLong() + "/facturar", Map.of("tipo", "01"), token, 409);
    }

    @Test
    void lasComprasConFacturaRestanIgvDelMes() throws Exception {
        String periodo = LocalDate.now().toString().substring(0, 7);
        JsonNode antes = obtener("/api/compras/resumen?periodo=" + periodo);

        post("/api/comprobantes", Map.of("tipo", "03",
                "items", new Object[]{Map.of("descripcion", "Martillo", "cantidad", 1, "precioUnitario", 118.00)},
                "pagos", new Object[]{Map.of("metodo", "EFECTIVO", "monto", 118.00)}), token, 200);
        String numero = String.valueOf(System.nanoTime() % 100000);
        post("/api/compras", Map.ofEntries(Map.entry("fechaEmision", LocalDate.now().toString()), Map.entry("tipoDocumento", "01"),
                Map.entry("serie", "F001"), Map.entry("numero", numero), Map.entry("proveedorTipoDoc", "6"),
                Map.entry("proveedorNumDoc", "20100123453"), Map.entry("proveedorNombre", "DISTRIBUIDORA DE ACEROS SA"),
                Map.entry("categoria", "Mercadería"), Map.entry("baseImponible", 50.00), Map.entry("igv", 9.00),
                Map.entry("total", 59.00)), token, 200);
        // Una boleta de proveedor no da crédito fiscal.
        post("/api/compras", Map.ofEntries(Map.entry("fechaEmision", LocalDate.now().toString()), Map.entry("tipoDocumento", "03"),
                Map.entry("serie", "B002"), Map.entry("numero", numero), Map.entry("proveedorTipoDoc", "1"),
                Map.entry("proveedorNumDoc", "45678912"), Map.entry("proveedorNombre", "Juan Pérez"),
                Map.entry("categoria", "Transporte"), Map.entry("baseImponible", 0), Map.entry("igv", 0),
                Map.entry("noGravado", 20.00), Map.entry("total", 20.00)), token, 200);
        // La misma factura del proveedor no se registra dos veces, y los montos deben cuadrar.
        post("/api/compras", Map.ofEntries(Map.entry("fechaEmision", LocalDate.now().toString()), Map.entry("tipoDocumento", "01"),
                Map.entry("serie", "F001"), Map.entry("numero", numero), Map.entry("proveedorTipoDoc", "6"),
                Map.entry("proveedorNumDoc", "20100123453"), Map.entry("proveedorNombre", "DISTRIBUIDORA DE ACEROS SA"),
                Map.entry("categoria", "Mercadería"), Map.entry("baseImponible", 50.00), Map.entry("igv", 9.00),
                Map.entry("total", 59.00)), token, 409);
        post("/api/compras", Map.ofEntries(Map.entry("fechaEmision", LocalDate.now().toString()), Map.entry("tipoDocumento", "01"),
                Map.entry("serie", "F009"), Map.entry("numero", "1"), Map.entry("proveedorTipoDoc", "6"),
                Map.entry("proveedorNumDoc", "20100123453"), Map.entry("proveedorNombre", "X"),
                Map.entry("categoria", "Otros"), Map.entry("baseImponible", 50.00), Map.entry("igv", 9.00),
                Map.entry("total", 80.00)), token, 400);

        JsonNode despues = obtener("/api/compras/resumen?periodo=" + periodo);
        assertThat(despues.path("ventasIgv").decimalValue().subtract(antes.path("ventasIgv").decimalValue())).isEqualByComparingTo("18.00");
        assertThat(despues.path("comprasIgv").decimalValue().subtract(antes.path("comprasIgv").decimalValue())).isEqualByComparingTo("9.00");
        assertThat(despues.path("gastoPorCategoria").path("Transporte").decimalValue()).isGreaterThanOrEqualTo(new java.math.BigDecimal("20.00"));

        String csv = mvc.perform(get("/api/compras/exportar?desde=" + LocalDate.now() + "&hasta=" + LocalDate.now())
                .header("Authorization", "Bearer " + token)).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(csv).contains("Base imponible", "DISTRIBUIDORA DE ACEROS SA");
    }

    // ------------------------------------------------------------------ apoyo

    private JsonNode obtener(String url) throws Exception {
        return leer(mvc.perform(get(url).header("Authorization", "Bearer " + token)));
    }

    private JsonNode post(String url, Object cuerpo, String tk, int esperado) throws Exception {
        var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(cuerpo));
        if (tk != null) req.header("Authorization", "Bearer " + tk);
        ResultActions r = mvc.perform(req);
        int st = r.andReturn().getResponse().getStatus();
        String body = r.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertThat(st).as("HTTP %s %s → %s", url, st, body).isEqualTo(esperado);
        return body.isBlank() ? json.createObjectNode() : json.readTree(body);
    }

    private JsonNode leer(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }
}
