#!/bin/sh
# Prepara el Moodle de pruebas: deja que Moodle hable con Andarama por una red
# privada y un puerto no estándar, y crea el curso, la profesora y el alumno.
# Es idempotente: se puede ejecutar tantas veces como haga falta.
#   docker compose exec moodle sh /usr/local/bin/moodle-setup.sh
set -eu
cd /var/www/html

# Moodle bloquea por defecto las peticiones salientes a redes privadas y a
# puertos distintos de 80/443. Andarama está en andarama.test:8795 (el
# anfitrión, vía host-gateway): sin esto Moodle no podría leer su JWKS.
php admin/cli/cfg.php --name=curlsecurityblockedhosts --set=""
php admin/cli/cfg.php --name=curlsecurityallowedport --set=""
# Sin correo: cada alta y matrícula dejaría un error de SMTP en la salida
php admin/cli/cfg.php --name=noreplyaddress --set=noreply@moodle.test
php admin/cli/cfg.php --name=smtphosts --set=""

php <<'PHP'
<?php
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->libdir . '/enrollib.php');

function anda_user(string $username, string $first, string $last): stdClass {
    global $DB, $CFG;
    $u = $DB->get_record('user', ['username' => $username]);
    if ($u) return $u;
    $id = user_create_user((object) [
        'username' => $username,
        'password' => 'Moodle-lti-2026',
        'firstname' => $first,
        'lastname' => $last,
        'email' => "$username@moodle.test",
        'auth' => 'manual',
        'confirmed' => 1,
        'mnethostid' => $CFG->mnet_localhost_id,
    ]);
    return $DB->get_record('user', ['id' => $id]);
}

// Las visitas guiadas de bienvenida de Moodle tapan los botones en las pruebas
$DB->set_field('tool_usertours_tours', 'enabled', 0);
cache::make('tool_usertours', 'tourdata')->purge();

$teacher = anda_user('profesora', 'Ana', 'Profesora');
$student = anda_user('alumno', 'Luis', 'Alumno');

$course = $DB->get_record('course', ['shortname' => 'ANDA360']);
if (!$course) {
    $course = create_course((object) [
        'fullname' => 'Recorridos virtuales con Andarama',
        'shortname' => 'ANDA360',
        'category' => 1,
        'format' => 'topics',
        'numsections' => 1,
    ]);
}

$plugin = enrol_get_plugin('manual');
$instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
if (!$instance) {
    $plugin->add_instance($course);
    $instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual']);
}
$roles = [
    'editingteacher' => $teacher,
    'student' => $student,
];
foreach ($roles as $shortname => $user) {
    $role = $DB->get_record('role', ['shortname' => $shortname]);
    $plugin->enrol_user($instance, $user->id, $role->id);
}
echo "course_id={$course->id}\n";
PHP
