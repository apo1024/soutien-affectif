// Compteur de présence anonyme : chaque onglet ouvert envoie un identifiant aléatoire
// (aucune donnée personnelle, aucun contenu du site) au broker MQTT public.
// La page stats.html compte les identifiants actifs. Si le broker est inaccessible, le site fonctionne normalement.
(function () {
  var BROKER = 'wss://broker.hivemq.com:8884/mqtt';
  var TOPIC = 'soutien-affectif-5b20042376e5/presence/';
  var HEARTBEAT_MS = 15000;
  if (typeof location === 'undefined' || !document.head || location.protocol === 'file:' || /[?&]nopresence\b/.test(location.search)) return;
  var id = Math.random().toString(36).slice(2, 12);
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
        if (client.connected) client.publish(TOPIC + id, document.hidden ? 'hidden' : 'on');
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
