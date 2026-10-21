package pe.altoque.cotizacion;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface CotizacionRepository extends JpaRepository<Cotizacion, Long> {

    Optional<Cotizacion> findByIdAndEmpresaId(Long id, Long empresaId);

    Optional<Cotizacion> findByTokenPublico(String token);

    Page<Cotizacion> findByEmpresaId(Long empresaId, Pageable pagina);

    @Query("select coalesce(max(c.numero), 0) from Cotizacion c where c.empresa.id = :empresaId")
    int ultimoNumero(Long empresaId);
}
