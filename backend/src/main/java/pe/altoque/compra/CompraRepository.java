package pe.altoque.compra;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CompraRepository extends JpaRepository<Compra, Long> {

    Optional<Compra> findByIdAndEmpresaId(Long id, Long empresaId);

    List<Compra> findByEmpresaIdAndFechaEmisionBetweenOrderByFechaEmisionDescIdDesc(Long empresaId, LocalDate desde,
                                                                                     LocalDate hasta);

    boolean existsByEmpresaIdAndProveedorNumDocAndTipoDocumentoAndSerieAndNumeroAndIdNot(
            Long empresaId, String proveedor, String tipo, String serie, String numero, Long id);
}
