package pe.altoque.compra;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import pe.altoque.empresa.Empresa;
import pe.altoque.usuario.Usuario;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * Comprobante que el negocio recibe de un proveedor (compra o gasto). Las facturas con IGV dan crédito fiscal: ese
 * IGV se resta del que cobró en sus ventas para saber cuánto pagar a SUNAT en el mes.
 */
@Entity
@Table(name = "compra")
@Getter
@Setter
public class Compra {

    public enum EstadoPago { PAGADO, POR_PAGAR }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id")
    private Empresa empresa;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id")
    private Usuario usuario;

    private LocalDate fechaEmision;
    /** Catálogo 01 de SUNAT: 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito, 12 ticket, 14 recibo de servicios, 00 otros. */
    private String tipoDocumento;
    private String serie;
    private String numero;
    private String proveedorTipoDoc;
    private String proveedorNumDoc;
    private String proveedorNombre;
    private String categoria;
    private BigDecimal baseImponible = BigDecimal.ZERO;
    private BigDecimal igv = BigDecimal.ZERO;
    private BigDecimal noGravado = BigDecimal.ZERO;
    private BigDecimal total;
    private String moneda = "PEN";

    @Enumerated(EnumType.STRING)
    private EstadoPago estadoPago = EstadoPago.PAGADO;

    private LocalDate fechaVencimiento;
    private String observaciones;
    private Instant createdAt;
    private Instant updatedAt;

    @PrePersist
    void alCrear() {
        createdAt = updatedAt = Instant.now();
    }

    @PreUpdate
    void alActualizar() {
        updatedAt = Instant.now();
    }

    /** Las notas de crédito restan. */
    public int signo() {
        return "07".equals(tipoDocumento) ? -1 : 1;
    }

    /** Solo las facturas y notas con RUC del proveedor dan derecho a usar su IGV. */
    public boolean daCreditoFiscal() {
        return "6".equals(proveedorTipoDoc) && ("01".equals(tipoDocumento) || "07".equals(tipoDocumento)
                || "08".equals(tipoDocumento) || "14".equals(tipoDocumento));
    }
}
