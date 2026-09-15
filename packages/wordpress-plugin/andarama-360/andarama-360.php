<?php
/**
 * Plugin Name:       Andarama 360 Virtual Tours
 * Plugin URI:        https://andarama.com/wordpress
 * Description:       Embed 360 virtual tours from Andarama (andarama.com or your own open-source instance) with a block, a shortcode or just by pasting the tour URL.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Andarama
 * Author URI:        https://andarama.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       andarama-360
 * Domain Path:       /languages
 *
 * @package Andarama_360
 */

/*
 * Este plugin es software libre bajo la GPL-2.0-or-later. El servidor de
 * Andarama (el que sirve los tours) es un proyecto aparte con licencia
 * EUPL-1.2; el plugin solo inserta iframes que apuntan a él.
 */

// Sin WordPress no hay nada que hacer.
defined( 'ABSPATH' ) || exit;

define( 'ANDARAMA_360_VERSION', '1.0.0' );
define( 'ANDARAMA_360_FILE', __FILE__ );
define( 'ANDARAMA_360_DIR', plugin_dir_path( __FILE__ ) );
define( 'ANDARAMA_360_URL', plugin_dir_url( __FILE__ ) );

require_once ANDARAMA_360_DIR . 'includes/class-andarama-360-settings.php';
require_once ANDARAMA_360_DIR . 'includes/class-andarama-360-embed.php';
require_once ANDARAMA_360_DIR . 'includes/class-andarama-360-block.php';

/**
 * Carga las traducciones incluidas en /languages (para instalaciones que no
 * las reciben de translate.wordpress.org).
 */
function andarama_360_load_textdomain() {
	load_plugin_textdomain( 'andarama-360', false, dirname( plugin_basename( ANDARAMA_360_FILE ) ) . '/languages' );
}
add_action( 'init', 'andarama_360_load_textdomain', 5 );

// Cada clase solo engancha sus hooks; el trabajo real ocurre en `init`.
Andarama_360_Settings::init();
Andarama_360_Embed::init();
Andarama_360_Block::init();
