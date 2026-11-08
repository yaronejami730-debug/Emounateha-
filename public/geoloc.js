/* Ville de référence : si le visiteur a déjà autorisé la position, on la relit à chaque visite (une seule lecture, au chargement de la page, jamais en continu).
   S'il a changé de lieu (ex. Paris -> Genève), la ville de référence est mise à jour et un écriteau l'indique. */
(function(){
var V=[["Yérouchalayim",281184,31.77,35.22],["Tel Aviv-Netanya",293397,32.08,34.78],["Haïfa",294801,32.82,34.99],["Ashdod",295629,31.79,34.65],["Netanya",294071,32.33,34.86],["Beer-Sheva",295530,31.25,34.79],["Eilat",295277,29.56,34.95],["Tsfat",293100,32.96,35.5],["Tibériade",293322,32.79,35.53],["Paris",2988507,48.85,2.35],["Sarcelles",2976043,48.99,2.38],["Créteil",3022530,48.79,2.46],["Boulogne-Billancourt",3031137,48.83,2.24],["Versailles",2969679,48.8,2.13],["Lyon",2996944,45.76,4.84],["Marseille",2995469,43.3,5.37],["Nice",2990440,43.7,7.27],["Cannes",3028808,43.55,7.01],["Aix-en-Provence",3038354,43.53,5.45],["Montpellier",2992166,43.61,3.88],["Toulouse",2972315,43.6,1.44],["Bordeaux",3031582,44.84,-0.58],["Nantes",2990969,47.22,-1.55],["Lille",2998324,50.63,3.06],["Strasbourg",2973783,48.57,7.75],["Metz",2994160,49.12,6.18],["Nancy",2990999,48.69,6.18],["Grenoble",3014728,45.17,5.72],["Genève",2660646,46.2,6.14],["Zurich",2657896,47.37,8.54],["Bruxelles",2800866,50.85,4.35],["Anvers",2803138,51.22,4.4],["Londres",2643743,51.51,-0.13],["Manchester",2643123,53.48,-2.24],["Milan",3173435,45.46,9.19],["Rome",3169070,41.9,12.5],["Madrid",3117735,40.42,-3.7],["Barcelone",3128760,41.39,2.17],["Casablanca",2553604,33.59,-7.62],["Tunis",2464470,36.82,10.17],["Johannesburg",993800,-26.2,28.05],["New York",5128581,40.71,-74.01],["Miami",4164138,25.77,-80.19],["Los Angeles",5368361,34.05,-118.24],["Boston",4930956,42.36,-71.06],["Montréal",6077243,45.51,-73.59],["Toronto",6167865,43.7,-79.42],["Mexico",3530597,19.43,-99.13],["Buenos Aires",3435910,-34.61,-58.38],["São Paulo",3448439,-23.55,-46.63],["Sydney",2147714,-33.87,151.21],["Melbourne",2158177,-37.81,144.96]];
function go(){
  var gi=null;try{gi=JSON.parse(localStorage.getItem('geoinfo')||'null')}catch(e){}
  if(!gi||!gi.gps||!navigator.geolocation||!navigator.permissions)return;           // seulement si la position a déjà été acceptée
  navigator.permissions.query({name:'geolocation'}).then(function(p){
    if(p.state!=='granted')return;
    navigator.geolocation.getCurrentPosition(function(pos){
      var lat=pos.coords.latitude,lon=pos.coords.longitude,k=Math.cos(lat*Math.PI/180),best=null,bd=1e9;
      V.forEach(function(c){var d=Math.pow(c[2]-lat,2)+Math.pow((c[3]-lon)*k,2);if(d<bd){bd=d;best=c}});
      if(!best||Math.sqrt(bd)*111>600)return;
      var km=Math.max(1,Math.round(Math.sqrt(bd)*111)),cur=null;try{cur=localStorage.getItem('parcity')}catch(e){}
      if(String(best[1])===String(cur)){try{localStorage.setItem('geoinfo',JSON.stringify({n:best[0],km:km,gps:1}))}catch(e){}return}
      try{localStorage.setItem('parcity',String(best[1]));localStorage.setItem('geoinfo',JSON.stringify({n:best[0],km:km,gps:1,moved:1}))}catch(e){}
      try{if(sessionStorage.getItem('geoReloaded'))return;sessionStorage.setItem('geoReloaded','1')}catch(e){}
      location.reload();                                                                // la page se recharge avec la nouvelle ville
    },function(){},{timeout:10000,maximumAge:300000});
  }).catch(function(){});
}
if(document.readyState!=='loading')go();else document.addEventListener('DOMContentLoaded',go);
})();
