<?php
/**
 * Limpieza al desinstalar: se borra la única opción que guarda el plugin.
 *
 * @package Andarama_360
 */

// Solo WordPress puede ejecutar este fichero, y solo al desinstalar.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'andarama_360_settings' );
