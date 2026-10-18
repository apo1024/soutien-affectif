// Compteur de présence anonyme : chaque onglet ouvert envoie un identifiant aléatoire
// (aucune donnée personnelle, aucun contenu du site) au broker MQTT public.
// La page stats.html compte les identifiants actifs. Si le broker est inaccessible, le site fonctionne normalement.
(function () {
  var BROKER = 'wss://broker.hivemq.com:8884/mqtt';
  var TOPIC = 'soutien-affectif-5b20042376e5/presence/';
  var HEARTBEAT_MS = 15000;
  if (typeof location === 'undefined' || !document.head || location.protocol === 'file:' || /[?&]nopresence\b/.test(location.search)) return;
  var id = Math.random().toString(36).slice(2, 12);
  /*PAYS*/var PAYS_TZ = {"America/New_York":"US","America/Detroit":"US","America/Chicago":"US","America/Denver":"US","America/Phoenix":"US","America/Los_Angeles":"US","America/Anchorage":"US","America/Boise":"US","America/Juneau":"US","America/Sitka":"US","America/Adak":"US","America/Nome":"US","America/Yakutat":"US","America/Menominee":"US","Pacific/Honolulu":"US","America/Toronto":"CA","America/Montreal":"CA","America/Vancouver":"CA","America/Edmonton":"CA","America/Winnipeg":"CA","America/Halifax":"CA","America/St_Johns":"CA","America/Regina":"CA","America/Moncton":"CA","America/Whitehorse":"CA","America/Yellowknife":"CA","America/Iqaluit":"CA","America/Glace_Bay":"CA","America/Goose_Bay":"CA","America/Swift_Current":"CA","America/Dawson_Creek":"CA","America/Atikokan":"CA","America/Port-au-Prince":"HT","America/Santo_Domingo":"DO","America/Puerto_Rico":"PR","America/Havana":"CU","America/Jamaica":"JM","America/Nassau":"BS","America/Grand_Turk":"TC","America/Guadeloupe":"GP","America/Martinique":"MQ","America/Cayenne":"GF","America/Mexico_City":"MX","America/Cancun":"MX","America/Monterrey":"MX","America/Tijuana":"MX","America/Merida":"MX","America/Chihuahua":"MX","America/Hermosillo":"MX","America/Mazatlan":"MX","America/Sao_Paulo":"BR","America/Fortaleza":"BR","America/Recife":"BR","America/Bahia":"BR","America/Belem":"BR","America/Manaus":"BR","America/Cuiaba":"BR","America/Maceio":"BR","America/Campo_Grande":"BR","America/Santiago":"CL","America/Punta_Arenas":"CL","Europe/Paris":"FR","Europe/Brussels":"BE","Europe/Zurich":"CH","Europe/London":"GB","Europe/Madrid":"ES","Africa/Dakar":"SN","Africa/Kinshasa":"CD","Africa/Lubumbashi":"CD","Africa/Abidjan":"CI","Africa/Douala":"CM","Asia/Dhaka":"BD"};
var PAYS_CODES = ["US", "CA", "HT", "DO", "PR", "CU", "JM", "BS", "TC", "GP", "MQ", "GF", "MX", "BR", "CL", "FR", "BE", "CH", "GB", "ES", "SN", "CD", "CI", "CM", "BD", "ZZ"];
function paysDuFuseau() { try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; return PAYS_TZ[z] || (/^America\/(Indiana|Kentucky|North_Dakota)\//.test(z) ? "US" : "ZZ"); } catch (e) { return "ZZ"; } }/*FINPAYS*/
  var pays = paysDuFuseau();
  // Total des visites (une par session de navigation) et des appareils (un par navigateur) :
  // compteurs gratuits Abacus, aucune donnée personnelle envoyée.
  var COUNT = 'https://abacus.jasoncameron.dev/hit/apo1024-soutien-5b2004/';
  try {
    if (!sessionStorage.getItem('sa-visit')) { sessionStorage.setItem('sa-visit', '1'); fetch(COUNT + 'visites').catch(function () {}); fetch(COUNT + 'pays-' + pays).catch(function () {}); }
    if (!localStorage.getItem('sa-device')) { localStorage.setItem('sa-device', '1'); fetch(COUNT + 'appareils').catch(function () {}); }
  } catch (e) {}
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/mqtt@5/dist/mqtt.min.js';
  s.async = true;
  s.onload = function () {
    try {
      var client = window.mqtt.connect(BROKER, {
        clientId: 'sa_' + id, clean: true, reconnectPeriod: 10000, connectTimeout: 10000,
        will: { topic: TOPIC + id, payload: '', qos: 0, retain: false }
      });
      var beat = function () {
        if (client.connected) client.publish(TOPIC + id, (document.hidden ? 'hidden' : 'on') + '|' + pays);
      };
      client.on('connect', beat);
      client.on('error', function () {});
      setInterval(beat, HEARTBEAT_MS);
      document.addEventListener('visibilitychange', beat);
      window.addEventListener('pagehide', function () {
        try { client.publish(TOPIC + id, ''); client.end(true); } catch (e) {}
      });
    } catch (e) {}
  };
  document.head.appendChild(s);
})();
