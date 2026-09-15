<?php
/**
 * Bloque de Gutenberg «Andarama 360 Tour» (dinámico: el HTML lo pinta PHP).
 *
 * @package Andarama_360
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registro del bloque y de sus recursos del editor.
 */
class Andarama_360_Block {

	/** Handle del script del editor (referenciado desde block.json). */
	const SCRIPT_HANDLE = 'andarama-360-editor';

	/** Handle de la hoja de estilos del editor. */
	const EDITOR_STYLE_HANDLE = 'andarama-360-editor';

	/**
	 * Engancha los hooks. Prioridad 20 para que ya exista el estilo del front.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 20 );
	}

	/**
	 * Registra script, estilos y el bloque.
	 */
	public static function register() {
		wp_register_script(
			self::SCRIPT_HANDLE,
			ANDARAMA_360_URL . 'block/block.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
			ANDARAMA_360_VERSION,
			true
		);
		wp_register_style( self::EDITOR_STYLE_HANDLE, ANDARAMA_360_URL . 'block/editor.css', array(), ANDARAMA_360_VERSION );
		wp_set_script_translations( self::SCRIPT_HANDLE, 'andarama-360', ANDARAMA_360_DIR . 'languages' );

		$settings = Andarama_360_Settings::get();
		$config   = array(
			'domains'       => array_values( $settings['domains'] ),
			'defaultHeight' => (int) $settings['default_height'],
			'defaultRatio'  => $settings['default_ratio'],
			'showBadge'     => (bool) $settings['show_badge'],
			'ratios'        => Andarama_360_Settings::ratios(),
		);
		wp_add_inline_script( self::SCRIPT_HANDLE, 'window.andarama360 = ' . wp_json_encode( $config ) . ';', 'before' );

		register_block_type(
			ANDARAMA_360_DIR . 'block',
			array( 'render_callback' => array( __CLASS__, 'render' ) )
		);
	}

	/**
	 * Pinta el bloque en el front.
	 *
	 * @param array $attributes Atributos guardados.
	 * @return string
	 */
	public static function render( $attributes ) {
		$attributes = is_array( $attributes ) ? $attributes : array();
		$args       = array(
			'url'    => isset( $attributes['url'] ) ? $attributes['url'] : '',
			'height' => isset( $attributes['height'] ) ? $attributes['height'] : 0,
			'ratio'  => isset( $attributes['ratio'] ) ? $attributes['ratio'] : '',
			'title'  => isset( $attributes['title'] ) ? $attributes['title'] : '',
		);
		$wrapper    = get_block_wrapper_attributes( array( 'class' => 'andarama-360' ) );
		return Andarama_360_Embed::render( $args, $wrapper );
	}
}
