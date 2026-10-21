package pe.altoque.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "altoque")
public record AltoqueProperties(
        String jwtSecret,
        int jwtHoras,
        String cryptoKey,
        String frontendUrl,
        List<String> corsOrigins,
        int diasPrueba,
        boolean demo,
        String apiperuToken,
        String mercadopagoToken,
        String apiPublicUrl,
        String archivosDir,
        Sunat sunat,
        String mailFrom
) {
    public record Sunat(String betaFacturaUrl, String produccionFacturaUrl, String produccionConsultaUrl, int timeoutSegundos,
                        String reintentoCron) {}
}
