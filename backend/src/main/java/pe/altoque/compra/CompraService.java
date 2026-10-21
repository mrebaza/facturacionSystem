package pe.altoque.compra;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.altoque.common.ApiException;
import pe.altoque.common.Catalogos;
import pe.altoque.common.Montos;
import pe.altoque.comprobante.Comprobante;
import pe.altoque.comprobante.Comprobante.EstadoSunat;
import pe.altoque.comprobante.ComprobanteService;
import pe.altoque.comprobante.TipoComprobante;
import pe.altoque.empresa.EmpresaRepository;
import pe.altoque.seguridad.Sesion;
import pe.altoque.usuario.UsuarioRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Compras y gastos del negocio, y el resumen tributario del mes: IGV de las ventas menos el IGV de las compras con
 * factura (crédito fiscal) = IGV a pagar. Es una estimación para planificar; la declaración la hace el contador.
 */
@Service
public class CompraService {

    public static final List<String> CATEGORIAS = List.of("Mercadería", "Insumos", "Alquiler", "Servicios (luz, agua, internet)",
            "Transporte", "Publicidad", "Equipos", "Mantenimiento", "Honorarios", "Otros");

    public record CompraRequest(
            @NotNull LocalDate fechaEmision,
            @NotBlank @Pattern(regexp = "01|03|07|08|12|14|00", message = "Tipo de comprobante inválido") String tipoDocumento,
            @NotBlank @Size(max = 20) String serie,
            @NotBlank @Size(max = 20) String numero,
            @NotBlank @Pattern(regexp = "[061]", message = "Tipo de documento del proveedor inválido") String proveedorTipoDoc,
            @NotBlank @Size(max = 15) String proveedorNumDoc,
            @NotBlank @Size(max = 200) String proveedorNombre,
            @NotBlank @Size(max = 40) String categoria,
            @NotNull @DecimalMin("0") BigDecimal baseImponible,
            @NotNull @DecimalMin("0") BigDecimal igv,
            @DecimalMin("0") BigDecimal noGravado,
            @NotNull @DecimalMin(value = "0.01", message = "El total debe ser mayor a cero") BigDecimal total,
            Compra.EstadoPago estadoPago,
            LocalDate fechaVencimiento,
            @Size(max = 300) String observaciones) {}

    public record CompraVista(Long id, LocalDate fechaEmision, String tipoDocumento, String tipoNombre, String serie,
                              String numero, String proveedorTipoDoc, String proveedorNumDoc, String proveedorNombre,
                              String categoria, BigDecimal baseImponible, BigDecimal igv, BigDecimal noGravado,
                              BigDecimal total, Compra.EstadoPago estadoPago, LocalDate fechaVencimiento,
                              String observaciones, boolean creditoFiscal) {}

    /** Resumen del mes: ventas, compras, IGV y en qué se gasta. */
    public record Resumen(String periodo, BigDecimal ventasBase, BigDecimal ventasIgv, BigDecimal ventasTotal, long comprobantes,
                          BigDecimal comprasBase, BigDecimal comprasIgv, BigDecimal comprasTotal, long compras,
                          BigDecimal igvPorPagar, BigDecimal saldoAFavor, BigDecimal porPagarProveedores,
                          Map<String, BigDecimal> gastoPorCategoria, BigDecimal utilidadEstimada) {}

    private static final Map<String, String> TIPOS = Map.of("01", "Factura", "03", "Boleta", "07", "Nota de crédito",
            "08", "Nota de débito", "12", "Ticket", "14", "Recibo de servicios", "00", "Otro");

    private final CompraRepository compras;
    private final EmpresaRepository empresas;
    private final UsuarioRepository usuarios;
    private final ComprobanteService comprobantes;

    public CompraService(CompraRepository compras, EmpresaRepository empresas, UsuarioRepository usuarios,
                         ComprobanteService comprobantes) {
        this.compras = compras;
        this.empresas = empresas;
        this.usuarios = usuarios;
        this.comprobantes = comprobantes;
    }

    @Transactional(readOnly = true)
    public List<CompraVista> listar(Sesion s, LocalDate desde, LocalDate hasta) {
        return compras.findByEmpresaIdAndFechaEmisionBetweenOrderByFechaEmisionDescIdDesc(s.empresaId(), desde, hasta)
                .stream().map(CompraService::vista).toList();
    }

    @Transactional
    public CompraVista guardar(Sesion s, Long id, CompraRequest r) {
        Compra c = id == null ? new Compra() : compras.findByIdAndEmpresaId(id, s.empresaId())
                .orElseThrow(() -> ApiException.noEncontrado("Compra"));
        String proveedor = r.proveedorNumDoc().trim();
        if (!"0".equals(r.proveedorTipoDoc()) && !Catalogos.documentoValido(r.proveedorTipoDoc(), proveedor)) {
            throw ApiException.invalido("6".equals(r.proveedorTipoDoc()) ? "El RUC del proveedor no es válido." : "Revisa el DNI del proveedor.");
        }
        if ("01".equals(r.tipoDocumento()) && !"6".equals(r.proveedorTipoDoc())) {
            throw ApiException.invalido("Una factura siempre tiene el RUC del proveedor.");
        }
        BigDecimal noGravado = Montos.nz(r.noGravado());
        BigDecimal suma = Montos.r2(r.baseImponible().add(r.igv()).add(noGravado));
        if (suma.subtract(Montos.r2(r.total())).abs().compareTo(new BigDecimal("0.05")) > 0) {
            throw ApiException.invalido("Base + IGV + no gravado (S/ %s) no cuadra con el total (S/ %s)."
                    .formatted(Montos.txt(suma), Montos.txt(r.total())));
        }
        if (r.fechaEmision().isAfter(LocalDate.now())) throw ApiException.invalido("La fecha del comprobante no puede ser futura.");
        String serie = r.serie().trim().toUpperCase();
        String numero = r.numero().trim().replaceFirst("^0+(?=\\d)", "");
        if (compras.existsByEmpresaIdAndProveedorNumDocAndTipoDocumentoAndSerieAndNumeroAndIdNot(s.empresaId(), proveedor,
                r.tipoDocumento(), serie, numero, id == null ? -1L : id)) {
            throw ApiException.conflicto("Ese comprobante del proveedor ya está registrado.");
        }
        if (id == null) {
            c.setEmpresa(empresas.getReferenceById(s.empresaId()));
            c.setUsuario(usuarios.getReferenceById(s.usuarioId()));
        }
        c.setFechaEmision(r.fechaEmision());
        c.setTipoDocumento(r.tipoDocumento());
        c.setSerie(serie);
        c.setNumero(numero);
        c.setProveedorTipoDoc(r.proveedorTipoDoc());
        c.setProveedorNumDoc(proveedor);
        c.setProveedorNombre(r.proveedorNombre().trim());
        c.setCategoria(r.categoria().trim());
        c.setBaseImponible(Montos.r2(r.baseImponible()));
        c.setIgv(Montos.r2(r.igv()));
        c.setNoGravado(Montos.r2(noGravado));
        c.setTotal(Montos.r2(r.total()));
        c.setEstadoPago(r.estadoPago() == null ? Compra.EstadoPago.PAGADO : r.estadoPago());
        c.setFechaVencimiento(c.getEstadoPago() == Compra.EstadoPago.POR_PAGAR ? r.fechaVencimiento() : null);
        c.setObservaciones(r.observaciones() == null || r.observaciones().isBlank() ? null : r.observaciones().trim());
        return vista(compras.save(c));
    }

    @Transactional
    public void eliminar(Sesion s, Long id) {
        compras.delete(compras.findByIdAndEmpresaId(id, s.empresaId()).orElseThrow(() -> ApiException.noEncontrado("Compra")));
    }

    @Transactional
    public CompraVista marcarPagada(Sesion s, Long id) {
        Compra c = compras.findByIdAndEmpresaId(id, s.empresaId()).orElseThrow(() -> ApiException.noEncontrado("Compra"));
        c.setEstadoPago(Compra.EstadoPago.PAGADO);
        c.setFechaVencimiento(null);
        return vista(c);
    }

    @Transactional(readOnly = true)
    public Resumen resumen(Sesion s, YearMonth periodo) {
        LocalDate desde = periodo.atDay(1);
        LocalDate hasta = periodo.atEndOfMonth();
        BigDecimal ventasBase = BigDecimal.ZERO, ventasIgv = BigDecimal.ZERO, ventasTotal = BigDecimal.ZERO;
        long emitidos = 0;
        for (Comprobante c : comprobantes.paraExportar(s, desde, hasta)) {
            if (c.getEstadoSunat() == EstadoSunat.RECHAZADO || c.getEstadoSunat() == EstadoSunat.ANULADO
                    || c.getEstadoSunat() == EstadoSunat.POR_ANULAR) {
                continue;
            }
            BigDecimal signo = c.getTipo() == TipoComprobante.NOTA_CREDITO ? BigDecimal.ONE.negate() : BigDecimal.ONE;
            ventasBase = ventasBase.add(c.getTotalGravado().add(c.getTotalExonerado()).add(c.getTotalInafecto()).multiply(signo));
            ventasIgv = ventasIgv.add(c.getTotalIgv().multiply(signo));
            ventasTotal = ventasTotal.add(c.getTotal().multiply(signo));
            emitidos++;
        }
        BigDecimal comprasBase = BigDecimal.ZERO, comprasIgv = BigDecimal.ZERO, comprasTotal = BigDecimal.ZERO;
        BigDecimal porPagar = BigDecimal.ZERO;
        Map<String, BigDecimal> porCategoria = new LinkedHashMap<>();
        List<Compra> lista = compras.findByEmpresaIdAndFechaEmisionBetweenOrderByFechaEmisionDescIdDesc(s.empresaId(), desde, hasta);
        for (Compra c : lista) {
            BigDecimal signo = BigDecimal.valueOf(c.signo());
            BigDecimal base = c.getBaseImponible().add(c.getNoGravado()).multiply(signo);
            comprasBase = comprasBase.add(base);
            comprasTotal = comprasTotal.add(c.getTotal().multiply(signo));
            // Sin crédito fiscal (boletas, tickets), el IGV pagado es parte del gasto.
            if (c.daCreditoFiscal()) comprasIgv = comprasIgv.add(c.getIgv().multiply(signo));
            porCategoria.merge(c.getCategoria(), c.daCreditoFiscal() ? base : c.getTotal().multiply(signo), BigDecimal::add);
            if (c.getEstadoPago() == Compra.EstadoPago.POR_PAGAR) porPagar = porPagar.add(c.getTotal());
        }
        BigDecimal diferencia = ventasIgv.subtract(comprasIgv);
        BigDecimal gastoSinIgv = porCategoria.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Resumen(periodo.toString(), Montos.r2(ventasBase), Montos.r2(ventasIgv), Montos.r2(ventasTotal), emitidos,
                Montos.r2(comprasBase), Montos.r2(comprasIgv), Montos.r2(comprasTotal), lista.size(),
                Montos.r2(diferencia.max(BigDecimal.ZERO)), Montos.r2(diferencia.negate().max(BigDecimal.ZERO)),
                Montos.r2(porPagar), porCategoria, Montos.r2(ventasBase.subtract(gastoSinIgv)));
    }

    public static String tipoNombre(String codigo) {
        return TIPOS.getOrDefault(codigo, codigo);
    }

    static CompraVista vista(Compra c) {
        return new CompraVista(c.getId(), c.getFechaEmision(), c.getTipoDocumento(), tipoNombre(c.getTipoDocumento()),
                c.getSerie(), c.getNumero(), c.getProveedorTipoDoc(), c.getProveedorNumDoc(), c.getProveedorNombre(),
                c.getCategoria(), c.getBaseImponible(), c.getIgv(), c.getNoGravado(), c.getTotal(), c.getEstadoPago(),
                c.getFechaVencimiento(), c.getObservaciones(), c.daCreditoFiscal());
    }
}
