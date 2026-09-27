/**
 * Bloque «Andarama 360 Tour» para el editor. Sin JSX ni build: todo con
 * wp.element.createElement para que el plugin se pueda leer y publicar tal cual.
 */
/* global wp, window */
( function () {
	'use strict';

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;
	var registerBlockType = wp.blocks.registerBlockType;
	var registerBlockVariation = wp.blocks.registerBlockVariation;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var RangeControl = wp.components.RangeControl;
	var SelectControl = wp.components.SelectControl;
	var Placeholder = wp.components.Placeholder;
	var Button = wp.components.Button;
	var Notice = wp.components.Notice;
	var ExternalLink = wp.components.ExternalLink;

	// Ajustes inyectados desde PHP (instancias permitidas, valores por defecto).
	var config = window.andarama360 || {};
	var domains = config.domains && config.domains.length ? config.domains : [ 'andarama.com' ];
	var defaultHeight = config.defaultHeight || 480;
	var defaultRatio = config.defaultRatio || '16/9';
	var ratioLabels = config.ratios || { '16/9': '16:9' };

	var IFRAME_ALLOW = 'fullscreen; gyroscope; accelerometer; xr-spatial-tracking';

	// La criatura de Andarama, el mismo dibujo que la insignia.
	var icon = el(
		'svg',
		{ xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 64 64', width: 24, height: 24, 'aria-hidden': 'true', focusable: 'false' },
		el( 'rect', { width: 64, height: 64, rx: 15, fill: '#ff8a00' } ),
		el(
			'g',
			{ transform: 'rotate(-3 32 32)' },
			el(
				'g',
				{ fill: '#ffd900' },
				el( 'path', { d: 'M32 8.5C44 7.5 54 17 54.5 29 55 40 49 49 39 51.5c-2.5.7-11.5.7-14 0C15 49 9 40 9.5 29 10 17 20 7.5 32 8.5Z' } ),
				el( 'ellipse', { cx: 21.5, cy: 54.2, rx: 6.5, ry: 4.5 } ),
				el( 'ellipse', { cx: 42.5, cy: 56, rx: 7, ry: 4.5 } )
			),
			el(
				'g',
				{ fill: '#33260f' },
				el( 'ellipse', { cx: 25.5, cy: 28, rx: 2, ry: 3.7 } ),
				el( 'ellipse', { cx: 38.5, cy: 28, rx: 2, ry: 3.7 } )
			),
			el( 'path', { d: 'M25 35q7 6.5 14 0', fill: 'none', stroke: '#33260f', strokeWidth: 2.6, strokeLinecap: 'round' } )
		)
	);

	function escapeRegExp( text ) {
		return text.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	}

	// ¿Es el host una instancia permitida o un subdominio de una?
	function hostAllowed( host ) {
		host = host.toLowerCase().replace( /^www\./, '' );
		return domains.some( function ( domain ) {
			return host === domain || host.slice( -( domain.length + 1 ) ) === '.' + domain;
		} );
	}

	// URL limpia del tour (esquema, host, /t/slug, query) o '' si no vale.
	function normalizeUrl( value ) {
		var url;
		try {
			url = new URL( ( value || '' ).trim() );
		} catch ( e ) {
			return '';
		}
		if ( url.protocol !== 'https:' && url.protocol !== 'http:' ) {
			return '';
		}
		if ( ! hostAllowed( url.host ) ) {
			return '';
		}
		var match = url.pathname.match( /^\/t\/([a-z0-9][a-z0-9-]*)\/?$/i );
		if ( ! match ) {
			return '';
		}
		return url.protocol + '//' + url.host + '/t/' + match[ 1 ].toLowerCase() + url.search;
	}

	// Mismo criterio que PHP: proporción si la hay, alto fijo si no.
	function frameStyle( height, ratio ) {
		var effective = ratio || defaultRatio;
		if ( effective && effective !== 'none' ) {
			return { width: '100%', height: 'auto', aspectRatio: effective.replace( ':', '/' ) };
		}
		return { width: '100%', height: ( height || defaultHeight ) + 'px' };
	}

	function ratioOptions() {
		var options = [
			{
				value: '',
				/* translators: %s: the aspect ratio chosen in the plugin settings */
				label: sprintf( __( 'Site default (%s)', 'andarama-360' ), ratioLabels[ defaultRatio ] || defaultRatio ),
			},
		];
		Object.keys( ratioLabels ).forEach( function ( key ) {
			options.push( { value: key, label: ratioLabels[ key ] } );
		} );
		return options;
	}

	function Edit( props ) {
		var attributes = props.attributes;
		var setAttributes = props.setAttributes;
		var draft = useState( attributes.url || '' );
		var draftUrl = draft[ 0 ];
		var setDraftUrl = draft[ 1 ];
		var blockProps = useBlockProps( { className: 'andarama-360-editor' } );
		var cleanUrl = normalizeUrl( attributes.url );

		function commit( event ) {
			if ( event ) {
				event.preventDefault();
			}
			setAttributes( { url: draftUrl.trim() } );
		}

		var inspector = el(
			InspectorControls,
			{},
			el(
				PanelBody,
				{ title: __( 'Tour settings', 'andarama-360' ) },
				el( TextControl, {
					label: __( 'Tour URL', 'andarama-360' ),
					type: 'url',
					value: attributes.url,
					onChange: function ( value ) {
						setAttributes( { url: value } );
						setDraftUrl( value );
					},
					help: __( 'Public address of a published tour, for example https://andarama.com/t/my-tour', 'andarama-360' ),
				} ),
				el( SelectControl, {
					label: __( 'Aspect ratio', 'andarama-360' ),
					value: attributes.ratio,
					options: ratioOptions(),
					onChange: function ( value ) {
						setAttributes( { ratio: value } );
					},
				} ),
				el( RangeControl, {
					label: __( 'Height (px)', 'andarama-360' ),
					value: attributes.height || defaultHeight,
					min: 200,
					max: 1200,
					step: 10,
					onChange: function ( value ) {
						setAttributes( { height: value } );
					},
					help: __( 'Used when the aspect ratio is set to fixed height.', 'andarama-360' ),
				} ),
				el( TextControl, {
					label: __( 'Accessible title', 'andarama-360' ),
					value: attributes.title,
					onChange: function ( value ) {
						setAttributes( { title: value } );
					},
					help: __( 'Read by screen readers. Defaults to “360 virtual tour”.', 'andarama-360' ),
				} )
			)
		);

		// Sin URL todavía: marcador con el campo para pegarla.
		if ( ! attributes.url ) {
			return el(
				'div',
				blockProps,
				inspector,
				el(
					Placeholder,
					{
						icon: icon,
						label: __( 'Andarama 360 Tour', 'andarama-360' ),
						instructions: __( 'Paste the public URL of a published tour.', 'andarama-360' ),
					},
					el(
						'form',
						{ className: 'andarama-360-editor__form', onSubmit: commit },
						el( TextControl, {
							label: __( 'Tour URL', 'andarama-360' ),
							hideLabelFromVision: true,
							type: 'url',
							placeholder: 'https://andarama.com/t/my-tour',
							value: draftUrl,
							onChange: setDraftUrl,
						} ),
						el( Button, { variant: 'primary', type: 'submit' }, __( 'Embed', 'andarama-360' ) )
					),
					el(
						'p',
						{ className: 'andarama-360-editor__hint' },
						el(
							ExternalLink,
							{ href: 'https://andarama.com/?utm_source=wordpress-plugin&utm_medium=block' },
							__( 'No tour yet? Create one at andarama.com', 'andarama-360' )
						)
					)
				)
			);
		}

		// URL escrita pero no reconocida.
		if ( ! cleanUrl ) {
			return el(
				'div',
				blockProps,
				inspector,
				el(
					Notice,
					{ status: 'warning', isDismissible: false },
					sprintf(
						/* translators: %s: comma-separated list of allowed hosts */
						__( 'This URL is not a tour from an allowed Andarama instance (%s). An administrator can add instances under Settings → Andarama.', 'andarama-360' ),
						domains.join( ', ' )
					)
				)
			);
		}

		// Vista previa: el mismo iframe que en el front, con una capa encima
		// para poder seleccionar el bloque cuando no está activo.
		return el(
			'div',
			blockProps,
			inspector,
			el(
				'figure',
				{ className: 'andarama-360' },
				el( 'iframe', {
					className: 'andarama-360__frame',
					src: cleanUrl,
					title: attributes.title || __( '360 virtual tour', 'andarama-360' ),
					style: frameStyle( attributes.height, attributes.ratio ),
					allow: IFRAME_ALLOW,
					allowFullScreen: true,
					loading: 'lazy',
				} ),
				! props.isSelected && el( 'div', { className: 'andarama-360-editor__overlay', 'aria-hidden': 'true' } ),
				config.showBadge &&
					el(
						'figcaption',
						{ className: 'andarama-360__caption' },
						el( 'span', { className: 'andarama-360__badge' }, __( 'Create yours with Andarama', 'andarama-360' ) )
					)
			)
		);
	}

	registerBlockType( 'andarama-360/tour', {
		icon: icon,
		edit: Edit,
		// Bloque dinámico: el HTML lo genera PHP.
		save: function () {
			return null;
		},
	} );

	// Variación del bloque «Insertar» para que, al pegar la URL de un tour,
	// el editor lo reconozca con nombre e icono propios.
	if ( registerBlockVariation ) {
		registerBlockVariation( 'core/embed', {
			name: 'andarama',
			title: 'Andarama',
			icon: icon,
			description: __( 'Embed a 360 virtual tour from Andarama.', 'andarama-360' ),
			keywords: [ __( 'virtual tour', 'andarama-360' ), '360', __( 'panorama', 'andarama-360' ) ],
			patterns: domains.map( function ( domain ) {
				return new RegExp( '^https?:\\/\\/([a-z0-9-]+\\.)*' + escapeRegExp( domain ) + '\\/t\\/[a-z0-9-]+', 'i' );
			} ),
			attributes: { providerNameSlug: 'andarama', responsive: true },
			isActive: function ( blockAttributes, variationAttributes ) {
				return blockAttributes.providerNameSlug === variationAttributes.providerNameSlug;
			},
		} );
	}
} )();
