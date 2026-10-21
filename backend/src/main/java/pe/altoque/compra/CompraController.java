package pe.altoque.compra;

import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.altoque.common.ApiException;
import pe.altoque.common.Montos;
import pe.altoque.compra.CompraService.CompraRequest;
import pe.altoque.compra.CompraService.CompraVista;
import pe.altoque.compra.CompraService.Resumen;
import pe.altoque.seguridad.Sesion;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/** Compras y gastos, el resumen de IGV del mes y el Registro de Compras para el contador. */
@RestController
@RequestMapping("/api/compras")
public class CompraController {

    private final CompraService service;

    public CompraController(CompraService service) {
        this.service = service;
    }

    @GetMapping("/categorias")
    public List<String> categorias() {
        return CompraService.CATEGORIAS;
    }

    @GetMapping
    public List<CompraVista> listar(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        if (desde.isAfter(hasta)) throw ApiException.invalido("La fecha inicial es mayor que la final.");
        return service.listar(Sesion.actual(), desde, hasta);
    }

    @PostMapping
    public CompraVista crear(@Valid @RequestBody CompraRequest r) {
        return service.guardar(Sesion.actual(), null, r);
    }

    @PutMapping("/{id}")
    public CompraVista actualizar(@PathVariable Long id, @Valid @RequestBody CompraRequest r) {
        return service.guardar(Sesion.actual(), id, r);
    }

    @PostMapping("/{id}/pagada")
    public CompraVista pagada(@PathVariable Long id) {
        return service.marcarPagada(Sesion.actual(), id);
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.eliminar(Sesion.actual(), id);
    }

    /** IGV a pagar del mes (periodo AAAA-MM; por defecto, el mes actual). */
    @GetMapping("/resumen")
    public Resumen resumen(@RequestParam(required = false) String periodo) {
        YearMonth mes;
        try {
            mes = periodo == null || periodo.isBlank() ? YearMonth.now() : YearMonth.parse(periodo);
        } catch (java.time.format.DateTimeParseException e) {
            throw ApiException.invalido("El periodo va como AAAA-MM, por ejemplo 2026-10.");
        }
        return service.resumen(Sesion.actual(), mes);
    }

    /** Registro de Compras en CSV (se abre en Excel) con las columnas que pide el contador. */
    @GetMapping(value = "/exportar", produces = "text/csv")
    public ResponseEntity<byte[]> exportar(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        StringBuilder csv = new StringBuilder("﻿Fecha;Tipo;Serie;Número;Tipo doc. proveedor;Doc. proveedor;Proveedor;"
                + "Categoría;Base imponible;IGV;No gravado;Total;Crédito fiscal;Estado de pago\n");
        for (CompraVista c : listar(desde, hasta)) {
            String signo = "07".equals(c.tipoDocumento()) ? "-" : "";
            csv.append(c.fechaEmision()).append(';').append(c.tipoDocumento()).append(';').append(c.serie()).append(';')
                    .append(c.numero()).append(';').append(c.proveedorTipoDoc()).append(';').append(c.proveedorNumDoc()).append(';')
                    .append(texto(c.proveedorNombre())).append(';').append(texto(c.categoria())).append(';')
                    .append(signo).append(Montos.txt(c.baseImponible())).append(';')
                    .append(signo).append(Montos.txt(c.igv())).append(';')
                    .append(signo).append(Montos.txt(c.noGravado())).append(';')
                    .append(signo).append(Montos.txt(c.total())).append(';')
                    .append(c.creditoFiscal() ? "Sí" : "No").append(';').append(c.estadoPago()).append('\n');
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"registro-compras-%s-a-%s.csv\"".formatted(desde, hasta))
                .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
                .body(csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String texto(String s) {
        return s == null ? "" : '"' + s.replace("\"", "\"\"") + '"';
    }
}
