package pe.altoque.empresa;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import pe.altoque.common.ApiException;
import pe.altoque.common.Cifrado;
import pe.altoque.comprobante.TipoComprobante;
import pe.altoque.seguridad.Sesion;
import pe.altoque.sunat.CertificadoService;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/** Ajustes del negocio: datos fiscales, SUNAT, certificado, locales y series. */
@RestController
@RequestMapping("/api")
public class EmpresaController {

    public record EmpresaDatos(String ruc, String razonSocial, String nombreComercial, String direccionFiscal, String ubigeo,
                               String departamento, String provincia, String distrito, String urbanizacion, String telefono,
                               String email, String mensajeTicket, BigDecimal igvPorcentaje, String ambienteSunat,
                               String solUsuario, boolean solConfigurado, String cuentaDetracciones) {
        static EmpresaDatos de(Empresa e) {
            return new EmpresaDatos(e.getRuc(), e.getRazonSocial(), e.getNombreComercial(), e.getDireccionFiscal(), e.getUbigeo(),
                    e.getDepartamento(), e.getProvincia(), e.getDistrito(), e.getUrbanizacion(), e.getTelefono(), e.getEmail(),
                    e.getMensajeTicket(), e.getIgvPorcentaje(), e.getAmbienteSunat().name(), e.getSolUsuario(), e.getSolClaveEnc() != null,
                    e.getCuentaDetracciones());
        }
    }

    public record EmpresaRequest(@NotBlank(message = "Escribe la razón social") @Size(max = 200) String razonSocial,
                                 @Size(max = 200) String nombreComercial,
                                 @NotBlank(message = "Escribe la dirección fiscal") @Size(max = 250) String direccionFiscal,
                                 @Pattern(regexp = "\\d{6}", message = "El ubigeo tiene 6 dígitos") String ubigeo,
                                 @Size(max = 60) String departamento,
                                 @Size(max = 60) String provincia,
                                 @Size(max = 60) String distrito,
                                 @Size(max = 100) String urbanizacion,
                                 @Size(max = 20) String telefono,
                                 @Email @Size(max = 150) String email,
                                 @Size(max = 160) String mensajeTicket) {}

    public record SunatRequest(@NotNull Empresa.Ambiente ambiente, @Size(max = 30) String solUsuario, @Size(max = 60) String solClave,
                               @Pattern(regexp = "\\d{8,20}|", message = "La cuenta de detracciones tiene solo números (11 dígitos en el Banco de la Nación)")
                               String cuentaDetracciones) {}

    public record CertificadoVista(String sujeto, String emisor, Instant validoDesde, Instant validoHasta, boolean autogenerado) {
        static CertificadoVista de(CertificadoDigital c) {
            return new CertificadoVista(c.getSujeto(), c.getEmisor(), c.getValidoDesde(), c.getValidoHasta(), c.isAutogenerado());
        }
    }

    public record LocalVista(Long id, String codigoSunat, String nombre, String direccion, String ubigeo, boolean activo) {
        static LocalVista de(Establecimiento l) {
            return new LocalVista(l.getId(), l.getCodigoSunat(), l.getNombre(), l.getDireccion(), l.getUbigeo(), l.isActivo());
        }
    }

    public record LocalRequest(@NotBlank @Pattern(regexp = "\\d{4}", message = "El código de local SUNAT tiene 4 dígitos") String codigoSunat,
                               @NotBlank(message = "Ponle un nombre al local") @Size(max = 120) String nombre,
                               @Size(max = 250) String direccion,
                               @Pattern(regexp = "\\d{6}", message = "El ubigeo tiene 6 dígitos") String ubigeo,
                               Boolean activo) {}

    public record SerieVista(Long id, TipoComprobante tipo, String serie, int correlativoActual, boolean activo, Long establecimientoId,
                             String establecimiento) {
        static SerieVista de(Serie s) {
            return new SerieVista(s.getId(), s.getTipoComprobante(), s.getSerie(), s.getCorrelativoActual(), s.isActivo(),
                    s.getEstablecimiento().getId(), s.getEstablecimiento().getNombre());
        }
    }

    public record SerieRequest(@NotNull TipoComprobante tipo,
                               @NotBlank @Pattern(regexp = "[A-Za-z0-9]{4}", message = "La serie tiene 4 caracteres, ej. B002") String serie,
                               @NotNull Long establecimientoId,
                               @Min(value = 0, message = "El correlativo no puede ser negativo") Integer correlativoInicial) {}

    private final EmpresaRepository empresas;
    private final EstablecimientoRepository locales;
    private final SerieRepository series;
    private final CertificadoRepository certificados;
    private final CertificadoService certificadoService;
    private final EmpresaService empresaService;
    private final Cifrado cifrado;

    public EmpresaController(EmpresaRepository empresas, EstablecimientoRepository locales, SerieRepository series,
                             CertificadoRepository certificados, CertificadoService certificadoService, EmpresaService empresaService,
                             Cifrado cifrado) {
        this.empresas = empresas;
        this.locales = locales;
        this.series = series;
        this.certificados = certificados;
        this.certificadoService = certificadoService;
        this.empresaService = empresaService;
        this.cifrado = cifrado;
    }

    // ------------------------------------------------------------------ empresa

    @GetMapping("/empresa")
    @Transactional(readOnly = true)
    public EmpresaDatos ver() {
        return EmpresaDatos.de(empresa());
    }

    @PutMapping("/empresa")
    @PreAuthorize("hasAnyRole('PROPIETARIO','ADMINISTRADOR')")
    @Transactional
    public EmpresaDatos actualizar(@Valid @RequestBody EmpresaRequest r) {
        Empresa e = empresa();
        e.setRazonSocial(r.razonSocial().trim().toUpperCase(Locale.ROOT));
        e.setNombreComercial(vacio(r.nombreComercial()));
        e.setDireccionFiscal(r.direccionFiscal().trim().toUpperCase(Locale.ROOT));
        e.setUbicacion(empresaService.resolverUbigeo(r.ubigeo(), r.distrito(), r.provincia(), r.departamento()));
        e.setUrbanizacion(vacio(r.urbanizacion()));
        e.setTelefono(vacio(r.telefono()));
        e.setEmail(vacio(r.email()));
        e.setMensajeTicket(vacio(r.mensajeTicket()));
        return EmpresaDatos.de(e);
    }

    @PutMapping("/empresa/sunat")
    @PreAuthorize("hasRole('PROPIETARIO')")
    @Transactional
    public EmpresaDatos sunat(@Valid @RequestBody SunatRequest r) {
        Empresa e = empresa();
        if (r.solUsuario() != null && !r.solUsuario().isBlank()) e.setSolUsuario(r.solUsuario().trim().toUpperCase(Locale.ROOT));
        if (r.solClave() != null && !r.solClave().isBlank()) e.setSolClaveEnc(cifrado.cifrar(r.solClave()));
        if (r.cuentaDetracciones() != null) e.setCuentaDetracciones(vacio(r.cuentaDetracciones()));
        if (r.ambiente() == Empresa.Ambiente.PRODUCCION) {
            if (e.getSolUsuario() == null || e.getSolClaveEnc() == null) {
                throw ApiException.invalido("Para pasar a producción necesitas tu usuario y clave SOL secundaria.");
            }
            boolean propio = certificados.findFirstByEmpresaIdAndActivoTrueOrderByIdDesc(e.getId()).map(c -> !c.isAutogenerado()).orElse(false);
            if (!propio) throw ApiException.invalido("Para pasar a producción sube primero tu certificado digital (.pfx).");
        }
        e.setAmbienteSunat(r.ambiente());
        return EmpresaDatos.de(e);
    }

    @GetMapping("/empresa/certificado")
    @Transactional(readOnly = true)
    public CertificadoVista certificado() {
        return certificados.findFirstByEmpresaIdAndActivoTrueOrderByIdDesc(Sesion.actual().empresaId())
                .map(CertificadoVista::de).orElse(null);
    }

    @PostMapping(value = "/empresa/certificado", consumes = "multipart/form-data")
    @PreAuthorize("hasRole('PROPIETARIO')")
    public CertificadoVista subirCertificado(@RequestParam("archivo") MultipartFile archivo, @RequestParam("clave") String clave) throws IOException {
        if (archivo.isEmpty()) throw ApiException.invalido("Adjunta tu archivo .pfx o .p12.");
        return CertificadoVista.de(certificadoService.subir(empresa(), archivo.getBytes(), clave));
    }

    // ------------------------------------------------------------------ locales

    @GetMapping("/establecimientos")
    @Transactional(readOnly = true)
    public List<LocalVista> locales() {
        return locales.findByEmpresaIdOrderByCodigoSunat(Sesion.actual().empresaId()).stream().map(LocalVista::de).toList();
    }

    @PostMapping("/establecimientos")
    @PreAuthorize("hasAnyRole('PROPIETARIO','ADMINISTRADOR')")
    @Transactional
    public LocalVista crearLocal(@Valid @RequestBody LocalRequest r) {
        Empresa e = empresas.findWithPlanById(Sesion.actual().empresaId()).orElseThrow();
        if (locales.countByEmpresaIdAndActivoTrue(e.getId()) >= e.getPlan().getMaxEstablecimientos()) {
            throw ApiException.invalido("Tu plan permite %d local(es). Pásate al plan Empresa para sumar sedes.".formatted(e.getPlan().getMaxEstablecimientos()));
        }
        if (locales.findByEmpresaIdAndCodigoSunat(e.getId(), r.codigoSunat()).isPresent()) {
            throw ApiException.conflicto("Ya tienes un local con el código " + r.codigoSunat() + ".");
        }
        Establecimiento l = new Establecimiento();
        l.setEmpresa(e);
        l.setCodigoSunat(r.codigoSunat());
        aplicar(l, r);
        return LocalVista.de(locales.save(l));
    }

    @PutMapping("/establecimientos/{id}")
    @PreAuthorize("hasAnyRole('PROPIETARIO','ADMINISTRADOR')")
    @Transactional
    public LocalVista editarLocal(@PathVariable Long id, @Valid @RequestBody LocalRequest r) {
        Establecimiento l = locales.findByIdAndEmpresaId(id, Sesion.actual().empresaId()).orElseThrow(() -> ApiException.noEncontrado("Local"));
        aplicar(l, r);
        if ("0000".equals(l.getCodigoSunat())) l.setActivo(true);
        return LocalVista.de(l);
    }

    private void aplicar(Establecimiento l, LocalRequest r) {
        l.setNombre(r.nombre().trim());
        l.setDireccion(vacio(r.direccion()));
        l.setUbigeo(r.ubigeo());
        if (r.activo() != null) l.setActivo(r.activo());
    }

    // ------------------------------------------------------------------ series

    @GetMapping("/series")
    @Transactional(readOnly = true)
    public List<SerieVista> series() {
        return series.listar(Sesion.actual().empresaId()).stream().map(SerieVista::de).toList();
    }

    @PostMapping("/series")
    @PreAuthorize("hasAnyRole('PROPIETARIO','ADMINISTRADOR')")
    @Transactional
    public SerieVista crearSerie(@Valid @RequestBody SerieRequest r) {
        Sesion s = Sesion.actual();
        String codigo = r.serie().toUpperCase(Locale.ROOT);
        if (!r.tipo().serieValida(codigo)) {
            throw ApiException.invalido(switch (r.tipo()) {
                case FACTURA -> "Las series de factura empiezan con F, ej. F002.";
                case BOLETA -> "Las series de boleta empiezan con B, ej. B002.";
                default -> "Las series de notas empiezan con F (de facturas) o B (de boletas), ej. FC02.";
            });
        }
        if (series.existsByEmpresaIdAndTipoComprobanteAndSerie(s.empresaId(), r.tipo(), codigo)) {
            throw ApiException.conflicto("Ya existe la serie " + codigo + ".");
        }
        Establecimiento l = locales.findByIdAndEmpresaId(r.establecimientoId(), s.empresaId()).orElseThrow(() -> ApiException.noEncontrado("Local"));
        Serie nueva = empresaService.crearSerie(l.getEmpresa(), l, r.tipo(), codigo);
        if (r.correlativoInicial() != null) nueva.setCorrelativoActual(r.correlativoInicial());
        return SerieVista.de(nueva);
    }

    @PatchMapping("/series/{id}")
    @PreAuthorize("hasAnyRole('PROPIETARIO','ADMINISTRADOR')")
    @Transactional
    public SerieVista activarSerie(@PathVariable Long id, @RequestParam boolean activo) {
        Serie s = series.findByIdAndEmpresaId(id, Sesion.actual().empresaId()).orElseThrow(() -> ApiException.noEncontrada("Serie"));
        s.setActivo(activo);
        return SerieVista.de(s);
    }

    private Empresa empresa() {
        return empresas.findById(Sesion.actual().empresaId()).orElseThrow(() -> ApiException.noEncontrada("Empresa"));
    }

    private static String vacio(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
