package pe.altoque.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import pe.altoque.config.AltoqueProperties;

import java.nio.charset.StandardCharsets;

/**
 * Correo saliente, opcional: sin MAIL_HOST no envía nada y devuelve {@code false}, y la pantalla ofrece WhatsApp o el
 * enlace. Un fallo de envío nunca deshace la venta.
 */
@Component
public class Correo {

    private static final Logger log = LoggerFactory.getLogger(Correo.class);

    public record Adjunto(String nombre, byte[] contenido, String tipo) {}

    private final ObjectProvider<JavaMailSender> sender;
    private final Environment env;
    private final AltoqueProperties props;

    public Correo(ObjectProvider<JavaMailSender> sender, Environment env, AltoqueProperties props) {
        this.sender = sender;
        this.env = env;
        this.props = props;
    }

    public boolean habilitado() {
        String host = env.getProperty("spring.mail.host");
        return host != null && !host.isBlank() && sender.getIfAvailable() != null;
    }

    public boolean enviar(String para, String asunto, String html, Adjunto... adjuntos) {
        if (!habilitado() || para == null || para.isBlank()) return false;
        try {
            var mensaje = sender.getObject().createMimeMessage();
            var ayuda = new MimeMessageHelper(mensaje, adjuntos.length > 0, StandardCharsets.UTF_8.name());
            String de = props.mailFrom() != null && !props.mailFrom().isBlank() ? props.mailFrom() : env.getProperty("spring.mail.username");
            ayuda.setFrom(de);
            ayuda.setTo(para);
            ayuda.setSubject(asunto);
            ayuda.setText(html, true);
            for (Adjunto a : adjuntos) {
                ayuda.addAttachment(a.nombre(), new org.springframework.core.io.ByteArrayResource(a.contenido()), a.tipo());
            }
            sender.getObject().send(mensaje);
            return true;
        } catch (Exception e) {
            log.warn("No se pudo enviar el correo «{}» a {}: {}", asunto, para, e.getMessage());
            return false;
        }
    }
}
