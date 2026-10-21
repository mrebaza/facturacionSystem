package pe.altoque.empresa;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmpresaRepository extends JpaRepository<Empresa, Long> {

    boolean existsByRuc(String ruc);

    Optional<Empresa> findByRuc(String ruc);

    @EntityGraph(attributePaths = "plan")
    Optional<Empresa> findWithPlanById(Long id);

    /** Bloquea la fila de la empresa: numeraciones propias (cotizaciones) sin repetirse. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select e from Empresa e where e.id = :id")
    Optional<Empresa> bloquear(Long id);
}
