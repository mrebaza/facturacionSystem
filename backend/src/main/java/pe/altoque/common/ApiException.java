package pe.altoque.common;

import org.springframework.http.HttpStatus;

/** Error de negocio con mensaje listo para mostrar al usuario. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(HttpStatus status, String mensaje) {
        super(mensaje);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public static ApiException noEncontrado(String que) {
        return new ApiException(HttpStatus.NOT_FOUND, que + " no encontrado");
    }

    /** Para sustantivos femeninos: «Cotización no encontrada». */
    public static ApiException noEncontrada(String que) {
        return new ApiException(HttpStatus.NOT_FOUND, que + " no encontrada");
    }

    public static ApiException invalido(String mensaje) {
        return new ApiException(HttpStatus.BAD_REQUEST, mensaje);
    }

    public static ApiException conflicto(String mensaje) {
        return new ApiException(HttpStatus.CONFLICT, mensaje);
    }

    public static ApiException prohibido(String mensaje) {
        return new ApiException(HttpStatus.FORBIDDEN, mensaje);
    }
}
