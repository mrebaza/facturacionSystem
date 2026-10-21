package pe.altoque.cotizacion;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import pe.altoque.catalogo.Cliente;
import pe.altoque.catalogo.Producto;
import pe.altoque.comprobante.Comprobante;
import pe.altoque.empresa.Empresa;
import pe.altoque.usuario.Usuario;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Cotización (proforma): lo que el negocio le ofrece a un cliente antes de venderle, como en Ventas de Odoo. No es
 * un comprobante ni va a SUNAT; cuando el cliente acepta, se convierte en boleta o factura con un clic.
 */
@Entity
@Table(name = "cotizacion")
@Getter
@Setter
public class Cotizacion {

    public enum Estado {
        /** Enviada al cliente, esperando respuesta. */
        ABIERTA,
        /** El cliente la aceptó (desde su enlace o se marcó a mano). */
        ACEPTADA,
        RECHAZADA,
        /** Ya se emitió su boleta o factura. */
        FACTURADA
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id")
    private Empresa empresa;

    private int numero;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id")
    private Usuario usuario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id")
    private Cliente cliente;

    private String clienteTipoDoc;
    private String clienteNumDoc;
    private String clienteNombre;
    private String clienteDireccion;
    private String clienteEmail;
    private String clienteTelefono;

    private LocalDate fechaEmision;
    private LocalDate validaHasta;
    private String moneda = "PEN";
    private BigDecimal igvPorcentaje;
    private BigDecimal totalGravado = BigDecimal.ZERO;
    private BigDecimal totalExonerado = BigDecimal.ZERO;
    private BigDecimal totalInafecto = BigDecimal.ZERO;
    private BigDecimal totalIgv = BigDecimal.ZERO;
    private BigDecimal totalIcbper = BigDecimal.ZERO;
    private BigDecimal total = BigDecimal.ZERO;
    private String observaciones;

    @Enumerated(EnumType.STRING)
    private Estado estado = Estado.ABIERTA;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "comprobante_id")
    private Comprobante comprobante;

    private String tokenPublico;
    private Instant createdAt;
    private Instant updatedAt;

    @OneToMany(mappedBy = "cotizacion", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("item")
    private List<Item> items = new ArrayList<>();

    @PrePersist
    void alCrear() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void alActualizar() {
        updatedAt = Instant.now();
    }

    public String numeroImpreso() {
        return "COT-%05d".formatted(numero);
    }

    /** Vencida: abierta y pasada su fecha de validez. */
    public boolean vencida(LocalDate hoy) {
        return estado == Estado.ABIERTA && validaHasta.isBefore(hoy);
    }

    @Entity(name = "CotizacionItem")
    @Table(name = "cotizacion_item")
    @Getter
    @Setter
    public static class Item {

        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        private Long id;

        @ManyToOne(fetch = FetchType.LAZY, optional = false)
        @JoinColumn(name = "cotizacion_id")
        private Cotizacion cotizacion;

        @ManyToOne(fetch = FetchType.LAZY)
        @JoinColumn(name = "producto_id")
        private Producto producto;

        private int item;
        private String codigo;
        private String descripcion;
        private String unidadMedida;
        private BigDecimal cantidad;
        /** Precio con IGV, como se cobra. */
        private BigDecimal precioUnitario;
        private String tipoAfectacion;
        private boolean icbper;
        private BigDecimal total;
    }
}
