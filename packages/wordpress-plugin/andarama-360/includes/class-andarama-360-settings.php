<?php
/**
 * Página de ajustes (Ajustes → Andarama) y acceso a la configuración.
 *
 * @package Andarama_360
 */

defined( 'ABSPATH' ) || exit;

/**
 * Ajustes del plugin: instancias permitidas, alto y proporción por defecto
 * y la insignia «Crea el tuyo en Andarama».
 */
class Andarama_360_Settings {

	/** Nombre de la opción en wp_options (un único array). */
	const OPTION = 'andarama_360_settings';

	/** Slug de la página de ajustes. */
	const PAGE = 'andarama-360';

	/** Grupo de la Settings API (gestiona el nonce en options.php). */
	const GROUP = 'andarama_360';

	/**
	 * Engancha los hooks de administración.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( ANDARAMA_360_FILE ), array( __CLASS__, 'action_links' ) );
	}

	/**
	 * Valores por defecto.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'domains'        => array( 'andarama.com' ),
			'default_height' => 480,
			'default_ratio'  => '16/9',
			'show_badge'     => true,
		);
	}

	/**
	 * Proporciones que ofrece el selector (clave CSS => etiqueta).
	 *
	 * @return array
	 */
	public static function ratios() {
		return array(
			'16/9' => __( '16:9 (widescreen)', 'andarama-360' ),
			'4/3'  => __( '4:3 (classic)', 'andarama-360' ),
			'21/9' => __( '21:9 (cinematic)', 'andarama-360' ),
			'1/1'  => __( '1:1 (square)', 'andarama-360' ),
			'none' => __( 'Fixed height (no aspect ratio)', 'andarama-360' ),
		);
	}

	/**
	 * Ajustes guardados, completados con los valores por defecto y saneados.
	 *
	 * @return array
	 */
	public static function get() {
		$saved = get_option( self::OPTION, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}
		$settings = wp_parse_args( $saved, self::defaults() );

		$settings['domains'] = self::sanitize_domains( $settings['domains'] );
		if ( empty( $settings['domains'] ) ) {
			$settings['domains'] = self::defaults()['domains'];
		}
		$settings['default_height'] = self::sanitize_height( $settings['default_height'] );
		$settings['default_ratio']  = self::sanitize_ratio_key( $settings['default_ratio'] );
		$settings['show_badge']     = (bool) $settings['show_badge'];

		/**
		 * Permite a un tema o a otro plugin alterar los ajustes en tiempo de ejecución.
		 *
		 * @param array $settings Ajustes ya saneados.
		 */
		return apply_filters( 'andarama_360_settings', $settings );
	}

	/**
	 * Normaliza un dominio escrito por el usuario: admite «https://host/ruta»,
	 * «www.host» o «host:puerto», y devuelve «host[:puerto]» en minúsculas.
	 * Devuelve cadena vacía si no es un nombre de host válido.
	 *
	 * @param string $value Texto introducido.
	 * @return string
	 */
	public static function normalize_domain( $value ) {
		$value = strtolower( trim( (string) $value ) );
		if ( '' === $value ) {
			return '';
		}
		if ( false !== strpos( $value, '://' ) ) {
			$host = wp_parse_url( $value, PHP_URL_HOST );
			$port = wp_parse_url( $value, PHP_URL_PORT );
			$value = is_string( $host ) ? $host . ( $port ? ':' . (int) $port : '' ) : '';
		} else {
			$value = preg_replace( '#[/?\#].*$#', '', $value );
		}
		$value = preg_replace( '#^www\.#', '', $value );
		if ( ! preg_match( '#^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$#', $value ) ) {
			return '';
		}
		return $value;
	}

	/**
	 * Sanea la lista de dominios (array o texto con uno por línea).
	 *
	 * @param mixed $raw Lista sin sanear.
	 * @return string[]
	 */
	public static function sanitize_domains( $raw ) {
		if ( is_string( $raw ) ) {
			$raw = preg_split( '/[\s,;]+/', $raw );
		}
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$domains = array();
		foreach ( $raw as $item ) {
			$domain = self::normalize_domain( $item );
			if ( '' !== $domain && ! in_array( $domain, $domains, true ) ) {
				$domains[] = $domain;
			}
		}
		return $domains;
	}

	/**
	 * Alto por defecto en píxeles, acotado a un rango razonable.
	 *
	 * @param mixed $value Valor sin sanear.
	 * @return int
	 */
	public static function sanitize_height( $value ) {
		$height = absint( $value );
		if ( $height < 100 || $height > 4000 ) {
			$height = self::defaults()['default_height'];
		}
		return $height;
	}

	/**
	 * Clave de proporción válida (una de `ratios()`), o la de por defecto.
	 *
	 * @param mixed $value Valor sin sanear.
	 * @return string
	 */
	public static function sanitize_ratio_key( $value ) {
		$value = is_string( $value ) ? $value : '';
		return array_key_exists( $value, self::ratios() ) ? $value : self::defaults()['default_ratio'];
	}

	/**
	 * Callback de saneado de la Settings API.
	 *
	 * @param mixed $input Datos del formulario.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$input = is_array( $input ) ? $input : array();
		$clean = array(
			'domains'        => self::sanitize_domains( isset( $input['domains'] ) ? $input['domains'] : '' ),
			'default_height' => self::sanitize_height( isset( $input['default_height'] ) ? $input['default_height'] : 0 ),
			'default_ratio'  => self::sanitize_ratio_key( isset( $input['default_ratio'] ) ? $input['default_ratio'] : '' ),
			'show_badge'     => ! empty( $input['show_badge'] ),
		);
		if ( empty( $clean['domains'] ) ) {
			$clean['domains'] = self::defaults()['domains'];
			add_settings_error(
				self::OPTION,
				'andarama_360_domains',
				__( 'The list of allowed instances was empty or invalid, so andarama.com has been restored.', 'andarama-360' ),
				'warning'
			);
		}
		return $clean;
	}

	/**
	 * Registra la opción, la sección y los campos.
	 */
	public static function register() {
		register_setting(
			self::GROUP,
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => self::defaults(),
				'show_in_rest'      => false,
			)
		);

		add_settings_section(
			'andarama_360_main',
			__( 'Embedding', 'andarama-360' ),
			array( __CLASS__, 'render_section' ),
			self::PAGE
		);

		add_settings_field(
			'andarama_360_domains',
			__( 'Allowed instances', 'andarama-360' ),
			array( __CLASS__, 'render_domains' ),
			self::PAGE,
			'andarama_360_main',
			array( 'label_for' => 'andarama_360_domains' )
		);
		add_settings_field(
			'andarama_360_default_ratio',
			__( 'Default aspect ratio', 'andarama-360' ),
			array( __CLASS__, 'render_ratio' ),
			self::PAGE,
			'andarama_360_main',
			array( 'label_for' => 'andarama_360_default_ratio' )
		);
		add_settings_field(
			'andarama_360_default_height',
			__( 'Default height', 'andarama-360' ),
			array( __CLASS__, 'render_height' ),
			self::PAGE,
			'andarama_360_main',
			array( 'label_for' => 'andarama_360_default_height' )
		);
		add_settings_field(
			'andarama_360_show_badge',
			__( 'Andarama link', 'andarama-360' ),
			array( __CLASS__, 'render_badge' ),
			self::PAGE,
			'andarama_360_main',
			array( 'label_for' => 'andarama_360_show_badge' )
		);
	}

	/**
	 * Entrada «Andarama» en el menú Ajustes.
	 */
	public static function add_menu() {
		add_options_page(
			__( 'Andarama 360 settings', 'andarama-360' ),
			'Andarama',
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render_page' )
		);
	}

	/**
	 * Enlace «Settings» en la lista de plugins.
	 *
	 * @param string[] $links Enlaces existentes.
	 * @return string[]
	 */
	public static function action_links( $links ) {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'andarama-360' ) . '</a>' );
		return $links;
	}

	/**
	 * Texto introductorio de la sección.
	 */
	public static function render_section() {
		echo '<p>' . esc_html__( 'These defaults apply to the block, the shortcode and pasted tour URLs. Each tour can override the height and aspect ratio.', 'andarama-360' ) . '</p>';
	}

	/**
	 * Campo: dominios permitidos.
	 */
	public static function render_domains() {
		$settings = self::get();
		?>
		<textarea id="andarama_360_domains" name="<?php echo esc_attr( self::OPTION ); ?>[domains]" rows="4" class="large-text code"><?php echo esc_textarea( implode( "\n", $settings['domains'] ) ); ?></textarea>
		<p class="description">
			<?php esc_html_e( 'One host per line. Only tours hosted on these instances will be embedded. andarama.com is included by default; add the host of your own Andarama instance, for example tours.example.org.', 'andarama-360' ); ?>
		</p>
		<?php
	}

	/**
	 * Campo: proporción por defecto.
	 */
	public static function render_ratio() {
		$settings = self::get();
		?>
		<select id="andarama_360_default_ratio" name="<?php echo esc_attr( self::OPTION ); ?>[default_ratio]">
			<?php foreach ( self::ratios() as $key => $label ) : ?>
				<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $settings['default_ratio'], $key ); ?>><?php echo esc_html( $label ); ?></option>
			<?php endforeach; ?>
		</select>
		<p class="description"><?php esc_html_e( 'The tour fills the available width and keeps this proportion.', 'andarama-360' ); ?></p>
		<?php
	}

	/**
	 * Campo: alto por defecto.
	 */
	public static function render_height() {
		$settings = self::get();
		?>
		<input type="number" id="andarama_360_default_height" name="<?php echo esc_attr( self::OPTION ); ?>[default_height]" value="<?php echo esc_attr( $settings['default_height'] ); ?>" min="100" max="4000" step="10" class="small-text"> px
		<p class="description"><?php esc_html_e( 'Used when the aspect ratio is set to fixed height.', 'andarama-360' ); ?></p>
		<?php
	}

	/**
	 * Campo: insignia bajo el tour.
	 */
	public static function render_badge() {
		$settings = self::get();
		?>
		<label for="andarama_360_show_badge">
			<input type="checkbox" id="andarama_360_show_badge" name="<?php echo esc_attr( self::OPTION ); ?>[show_badge]" value="1" <?php checked( $settings['show_badge'] ); ?>>
			<?php esc_html_e( 'Show a small “Create yours with Andarama” link under each tour', 'andarama-360' ); ?>
		</label>
		<p class="description"><?php esc_html_e( 'It helps other people discover the free, open-source software behind the tour. Thank you!', 'andarama-360' ); ?></p>
		<?php
	}

	/**
	 * Página completa de ajustes.
	 */
	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::GROUP );
				do_settings_sections( self::PAGE );
				submit_button();
				?>
			</form>

			<h2><?php esc_html_e( 'How to embed a tour', 'andarama-360' ); ?></h2>
			<ol>
				<li><?php esc_html_e( 'In the block editor, add the “Andarama 360 Tour” block, or simply paste the tour URL in an empty paragraph.', 'andarama-360' ); ?></li>
				<li>
					<?php esc_html_e( 'Anywhere else (Classic Editor, widgets, Elementor, Divi…), use the shortcode:', 'andarama-360' ); ?>
					<code>[andarama url="https://andarama.com/t/my-tour" height="480" ratio="16/9"]</code>
				</li>
			</ol>
			<p>
				<?php
				printf(
					/* translators: %s: link to andarama.com */
					esc_html__( 'Do not have a tour yet? Create one at %s or install your own instance: Andarama is open source.', 'andarama-360' ),
					'<a href="https://andarama.com/?utm_source=wordpress-plugin&amp;utm_medium=settings" target="_blank" rel="noopener">andarama.com</a>'
				);
				?>
			</p>
		</div>
		<?php
	}
}
