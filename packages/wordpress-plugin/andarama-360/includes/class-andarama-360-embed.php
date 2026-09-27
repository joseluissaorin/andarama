<?php
/**
 * Pintado del iframe: shortcode, proveedor de embed (URL pegada) y el HTML
 * común que también usa el bloque.
 *
 * @package Andarama_360
 */

defined( 'ABSPATH' ) || exit;

/**
 * Genera el iframe del tour con los permisos correctos y la insignia.
 */
class Andarama_360_Embed {

	/** Handle de la hoja de estilos del front (la comparte el bloque). */
	const STYLE_HANDLE = 'andarama-360';

	/** Permisos del iframe: sin `xr-spatial-tracking` el modo VR no arranca. */
	const IFRAME_ALLOW = 'fullscreen; gyroscope; accelerometer; xr-spatial-tracking';

	/**
	 * Engancha los hooks.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
	}

	/**
	 * Registra estilos, shortcodes y el manejador de embed.
	 */
	public static function register() {
		wp_register_style( self::STYLE_HANDLE, ANDARAMA_360_URL . 'assets/andarama-360.css', array(), ANDARAMA_360_VERSION );

		add_shortcode( 'andarama', array( __CLASS__, 'shortcode' ) );
		add_shortcode( 'andarama_360', array( __CLASS__, 'shortcode' ) );

		// URL pegada en un párrafo (editor clásico y bloque «Insertar»).
		wp_embed_register_handler( 'andarama-360', self::url_pattern(), array( __CLASS__, 'embed_handler' ) );
	}

	/**
	 * Expresión regular que reconoce la URL pública de un tour en cualquiera
	 * de las instancias permitidas.
	 *
	 * @return string
	 */
	public static function url_pattern() {
		$hosts = array();
		foreach ( Andarama_360_Settings::get()['domains'] as $domain ) {
			$hosts[] = preg_quote( $domain, '#' );
		}
		return '#^https?://(?:[a-z0-9-]+\.)*(?:' . implode( '|', $hosts ) . ')/t/[a-z0-9][a-z0-9-]*/?(?:[?\#]\S*)?$#i';
	}

	/**
	 * Manejador de `wp_embed_register_handler`.
	 *
	 * @param array  $matches Capturas de la expresión regular.
	 * @param array  $attr    Atributos del embed (ancho/alto).
	 * @param string $url     URL original.
	 * @return string|false HTML, o false para que WordPress siga con otros manejadores.
	 */
	public static function embed_handler( $matches, $attr, $url ) {
		if ( '' === self::normalize_url( $url ) ) {
			return false;
		}
		return self::render( array( 'url' => $url ) );
	}

	/**
	 * Shortcode `[andarama url="..." height="480" ratio="16/9" title="..." badge="yes"]`.
	 *
	 * @param array|string $atts Atributos.
	 * @return string
	 */
	public static function shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'url'    => '',
				'height' => '',
				'ratio'  => '',
				'title'  => '',
				'badge'  => '',
			),
			$atts,
			'andarama'
		);
		return self::render( $atts );
	}

	/**
	 * ¿Está el host en la lista de instancias permitidas (o es un subdominio)?
	 *
	 * @param string $host Host normalizado (sin «www.», con puerto si lo hay).
	 * @return bool
	 */
	public static function host_allowed( $host ) {
		$allowed = false;
		foreach ( Andarama_360_Settings::get()['domains'] as $domain ) {
			if ( $host === $domain || substr( $host, -strlen( '.' . $domain ) ) === '.' . $domain ) {
				$allowed = true;
				break;
			}
		}

		/**
		 * Permite afinar qué hosts se aceptan.
		 *
		 * @param bool   $allowed Resultado de la lista de ajustes.
		 * @param string $host    Host consultado.
		 */
		return (bool) apply_filters( 'andarama_360_host_allowed', $allowed, $host );
	}

	/**
	 * Devuelve la URL del tour reconstruida (esquema, host, /t/slug y query)
	 * o cadena vacía si no es un tour de una instancia permitida.
	 *
	 * @param string $url URL introducida.
	 * @return string
	 */
	public static function normalize_url( $url ) {
		$url   = trim( (string) $url );
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) || empty( $parts['path'] ) ) {
			return '';
		}
		$scheme = isset( $parts['scheme'] ) ? strtolower( $parts['scheme'] ) : '';
		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) ) {
			return '';
		}
		$host = strtolower( $parts['host'] ) . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' );
		if ( ! self::host_allowed( preg_replace( '#^www\.#', '', $host ) ) ) {
			return '';
		}
		if ( ! preg_match( '#^/t/([a-z0-9][a-z0-9-]*)/?$#i', $parts['path'], $m ) ) {
			return '';
		}
		$clean = $scheme . '://' . $host . '/t/' . strtolower( $m[1] );
		if ( ! empty( $parts['query'] ) ) {
			$clean .= '?' . $parts['query'];
		}
		return $clean;
	}

	/**
	 * Proporción CSS válida («16/9») a partir de «16/9», «16:9» o «none».
	 * Devuelve cadena vacía cuando hay que usar alto fijo.
	 *
	 * @param string $ratio Valor introducido.
	 * @return string
	 */
	public static function sanitize_ratio( $ratio ) {
		$ratio = strtolower( trim( (string) $ratio ) );
		if ( '' === $ratio || 'none' === $ratio ) {
			return '';
		}
		if ( preg_match( '#^(\d{1,3})\s*[/:]\s*(\d{1,3})$#', $ratio, $m ) && (int) $m[1] > 0 && (int) $m[2] > 0 ) {
			return (int) $m[1] . '/' . (int) $m[2];
		}
		return '';
	}

	/**
	 * HTML del tour.
	 *
	 * @param array  $args               url, height, ratio, title, badge.
	 * @param string $wrapper_attributes Atributos ya escapados para el <figure> (los pasa el bloque).
	 * @return string
	 */
	public static function render( array $args, $wrapper_attributes = '' ) {
		$settings = Andarama_360_Settings::get();

		$raw_url = isset( $args['url'] ) ? (string) $args['url'] : '';
		$url     = self::normalize_url( $raw_url );
		if ( '' === $url ) {
			return self::render_notice( $raw_url );
		}

		$height = isset( $args['height'] ) ? absint( $args['height'] ) : 0;
		if ( $height < 100 || $height > 4000 ) {
			$height = (int) $settings['default_height'];
		}

		$ratio = isset( $args['ratio'] ) ? trim( (string) $args['ratio'] ) : '';
		if ( '' === $ratio ) {
			$ratio = $settings['default_ratio'];
		}
		$ratio = self::sanitize_ratio( $ratio );

		$title = isset( $args['title'] ) ? sanitize_text_field( $args['title'] ) : '';
		if ( '' === $title ) {
			$title = __( '360 virtual tour', 'andarama-360' );
		}

		$badge = (bool) $settings['show_badge'];
		if ( isset( $args['badge'] ) && '' !== $args['badge'] ) {
			$badge = filter_var( $args['badge'], FILTER_VALIDATE_BOOLEAN );
		}

		$style = '' !== $ratio ? 'aspect-ratio:' . $ratio . ';height:auto;' : 'height:' . $height . 'px;';

		wp_enqueue_style( self::STYLE_HANDLE );

		if ( '' === $wrapper_attributes ) {
			$wrapper_attributes = 'class="andarama-360"';
		}

		$html  = '<figure ' . $wrapper_attributes . '>';
		$html .= sprintf(
			'<iframe class="andarama-360__frame" src="%1$s" title="%2$s" style="%3$s" width="100%%" height="%4$d" allow="%5$s" allowfullscreen loading="lazy"></iframe>',
			esc_url( $url ),
			esc_attr( $title ),
			esc_attr( $style ),
			$height,
			esc_attr( self::IFRAME_ALLOW )
		);
		if ( $badge ) {
			$html .= self::badge();
		}
		$html .= '</figure>';

		/**
		 * HTML final del tour embebido.
		 *
		 * @param string $html HTML generado.
		 * @param string $url  URL del tour ya normalizada.
		 * @param array  $args Argumentos recibidos.
		 */
		return apply_filters( 'andarama_360_embed_html', $html, $url, $args );
	}

	/**
	 * Aviso, solo para quien puede editar, cuando la URL no es válida.
	 *
	 * @param string $raw_url URL rechazada.
	 * @return string
	 */
	private static function render_notice( $raw_url ) {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return '';
		}
		$domains = implode( ', ', Andarama_360_Settings::get()['domains'] );
		$message = '' === trim( $raw_url )
			? __( 'Andarama 360: no tour URL was given.', 'andarama-360' )
			/* translators: 1: rejected URL, 2: comma-separated list of allowed hosts */
			: sprintf( __( 'Andarama 360: “%1$s” is not a tour from an allowed instance (%2$s). Editors can add instances under Settings → Andarama.', 'andarama-360' ), $raw_url, $domains );
		return '<p class="andarama-360__notice">' . esc_html( $message ) . '</p>';
	}

	/**
	 * Insignia «Crea el tuyo en Andarama» bajo el tour.
	 *
	 * @return string
	 */
	private static function badge() {
		/**
		 * Destino de la insignia.
		 *
		 * @param string $url URL por defecto (andarama.com con UTM).
		 */
		$url = apply_filters( 'andarama_360_badge_url', 'https://andarama.com/?utm_source=wordpress-plugin&utm_medium=badge' );

		return '<figcaption class="andarama-360__caption">'
			. '<a class="andarama-360__badge" href="' . esc_url( $url ) . '" target="_blank" rel="noopener">'
			. self::badge_icon()
			. '<span>' . esc_html__( 'Create yours with Andarama', 'andarama-360' ) . '</span>'
			. '</a></figcaption>';
	}

	/**
	 * La criatura de Andarama, en versión mínima y en línea (sin peticiones).
	 *
	 * @return string
	 */
	private static function badge_icon() {
		return '<svg class="andarama-360__icon" viewBox="0 0 64 64" width="16" height="16" aria-hidden="true" focusable="false">'
			. '<rect width="64" height="64" rx="15" fill="#ff8a00"/>'
			. '<g transform="rotate(-3 32 32)">'
			. '<g fill="#ffd900"><path d="M32 8.5C44 7.5 54 17 54.5 29 55 40 49 49 39 51.5c-2.5.7-11.5.7-14 0C15 49 9 40 9.5 29 10 17 20 7.5 32 8.5Z"/><ellipse cx="21.5" cy="54.2" rx="6.5" ry="4.5"/><ellipse cx="42.5" cy="56" rx="7" ry="4.5"/></g>'
			. '<g fill="#33260f"><ellipse cx="25.5" cy="28" rx="2" ry="3.7"/><ellipse cx="38.5" cy="28" rx="2" ry="3.7"/></g>'
			. '<path d="M25 35q7 6.5 14 0" fill="none" stroke="#33260f" stroke-width="2.6" stroke-linecap="round"/>'
			. '</g></svg>';
	}
}
