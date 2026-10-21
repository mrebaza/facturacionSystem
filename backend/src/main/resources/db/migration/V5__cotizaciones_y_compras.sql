-- Módulos al estilo de Odoo: cotizaciones (Ventas) y compras/gastos con el IGV del mes (Contabilidad).

-- ---------------------------------------------------------------- Cotizaciones
CREATE TABLE cotizacion (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id        BIGINT         NOT NULL,
    numero            INT            NOT NULL,
    usuario_id        BIGINT         NOT NULL,
    cliente_id        BIGINT,
    cliente_tipo_doc  VARCHAR(1)     NOT NULL,
    cliente_num_doc   VARCHAR(15)    NOT NULL,
    cliente_nombre    VARCHAR(200)   NOT NULL,
    cliente_direccion VARCHAR(250),
    cliente_email     VARCHAR(150),
    cliente_telefono  VARCHAR(20),
    fecha_emision     DATE           NOT NULL,
    valida_hasta      DATE           NOT NULL,
    moneda            VARCHAR(3)     NOT NULL DEFAULT 'PEN',
    igv_porcentaje    DECIMAL(5,2)   NOT NULL,
    total_gravado     DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total_exonerado   DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total_inafecto    DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total_igv         DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total_icbper      DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total             DECIMAL(12,2)  NOT NULL,
    observaciones     VARCHAR(500),
    estado            VARCHAR(12)    NOT NULL,
    comprobante_id    BIGINT,
    token_publico     VARCHAR(32)    NOT NULL,
    created_at        DATETIME(6)    NOT NULL,
    updated_at        DATETIME(6)    NOT NULL,
    CONSTRAINT uk_cotizacion_numero UNIQUE (empresa_id, numero),
    CONSTRAINT uk_cotizacion_token UNIQUE (token_publico),
    CONSTRAINT fk_cotizacion_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id),
    CONSTRAINT fk_cotizacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT fk_cotizacion_cliente FOREIGN KEY (cliente_id) REFERENCES cliente (id),
    CONSTRAINT fk_cotizacion_comprobante FOREIGN KEY (comprobante_id) REFERENCES comprobante (id),
    CONSTRAINT ck_cotizacion_estado CHECK (estado IN ('ABIERTA', 'ACEPTADA', 'RECHAZADA', 'FACTURADA'))
);
CREATE INDEX ix_cotizacion_fecha ON cotizacion (empresa_id, fecha_emision);

CREATE TABLE cotizacion_item (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    cotizacion_id    BIGINT         NOT NULL,
    producto_id      BIGINT,
    item             INT            NOT NULL,
    codigo           VARCHAR(30),
    descripcion      VARCHAR(500)   NOT NULL,
    unidad_medida    VARCHAR(3)     NOT NULL,
    cantidad         DECIMAL(12,3)  NOT NULL,
    precio_unitario  DECIMAL(14,4)  NOT NULL,
    tipo_afectacion  VARCHAR(2)     NOT NULL,
    icbper           BOOLEAN        NOT NULL DEFAULT FALSE,
    total            DECIMAL(12,2)  NOT NULL,
    CONSTRAINT uk_cotizacion_item UNIQUE (cotizacion_id, item),
    CONSTRAINT fk_cotizacion_item_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizacion (id) ON DELETE CASCADE,
    CONSTRAINT fk_cotizacion_item_producto FOREIGN KEY (producto_id) REFERENCES producto (id)
);

-- ---------------------------------------------------------------- Compras y gastos
-- Comprobantes que el negocio recibe de sus proveedores. Las facturas con RUC dan crédito fiscal (IGV que se resta).
CREATE TABLE compra (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id          BIGINT         NOT NULL,
    usuario_id          BIGINT         NOT NULL,
    fecha_emision       DATE           NOT NULL,
    tipo_documento      VARCHAR(2)     NOT NULL,
    serie               VARCHAR(20)    NOT NULL,
    numero              VARCHAR(20)    NOT NULL,
    proveedor_tipo_doc  VARCHAR(1)     NOT NULL,
    proveedor_num_doc   VARCHAR(15)    NOT NULL,
    proveedor_nombre    VARCHAR(200)   NOT NULL,
    categoria           VARCHAR(40)    NOT NULL,
    base_imponible      DECIMAL(12,2)  NOT NULL DEFAULT 0,
    igv                 DECIMAL(12,2)  NOT NULL DEFAULT 0,
    no_gravado          DECIMAL(12,2)  NOT NULL DEFAULT 0,
    total               DECIMAL(12,2)  NOT NULL,
    moneda              VARCHAR(3)     NOT NULL DEFAULT 'PEN',
    estado_pago         VARCHAR(12)    NOT NULL,
    fecha_vencimiento   DATE,
    observaciones       VARCHAR(300),
    created_at          DATETIME(6)    NOT NULL,
    updated_at          DATETIME(6)    NOT NULL,
    CONSTRAINT uk_compra_documento UNIQUE (empresa_id, proveedor_num_doc, tipo_documento, serie, numero),
    CONSTRAINT fk_compra_empresa FOREIGN KEY (empresa_id) REFERENCES empresa (id),
    CONSTRAINT fk_compra_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT ck_compra_tipo CHECK (tipo_documento IN ('01', '03', '07', '08', '12', '14', '00')),
    CONSTRAINT ck_compra_pago CHECK (estado_pago IN ('PAGADO', 'POR_PAGAR')),
    CONSTRAINT ck_compra_montos CHECK (base_imponible >= 0 AND igv >= 0 AND no_gravado >= 0 AND total > 0)
);
CREATE INDEX ix_compra_fecha ON compra (empresa_id, fecha_emision);
