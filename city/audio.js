"use strict";

/* The city page's half of the shared engine: it only says what this page's
   scene is.  All of the sound lives in shared/audio.js. */
function audioScene(){
  return {
    city: state.city,
    season: state.season,
    rain: state.rainTarget,
    snow: state.snowTarget,
    phase: session.paused ? "pause" : session.kind
  };
}
