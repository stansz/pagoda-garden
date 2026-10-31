"use strict";

/* The garden's half of the shared engine: it only says what this page's
   scene is.  All of the sound lives in shared/audio.js. */
function audioScene(){
  return {
    city: PLACES[placeIx].id,
    season: "",
    rain: rainTarget,
    snow: snowTarget,
    phase: "idle"
  };
}
