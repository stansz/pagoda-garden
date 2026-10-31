"use strict";

/* ------------------------------------------------- Vancouver: The Far Light */
// Data only: city/walk.js reads it. A line of text is a string, or { if, t } to
// show only when the condition holds. A choice's `show` hides it outright; its
// `if` leaves it visible but locked, with `hint` saying why, and `now` is the small
// note it wears while a time or weather lock is open.
STORY.vancouver = {
  title: "The Far Light",
  start: "window",
  finish: "done",

  items: {
    cap:      { name: "bottle cap", note: "Shiny, in the sense that matters to herons." },
    seaglass: { name: "sea glass", note: "Green, and worn soft by a long time spent going nowhere." },
    thread:   { name: "rain-thread", note: "Weighs nothing. Slightly damp, and always will be." },
    spark:    { name: "the spark", note: "Warm in the pocket. Very well behaved." },
    oil:      { name: "tin of lamp oil", note: "Forty years of the same tin, by the look of it." },
    lantern:  { name: "lantern seed", note: "Plant it in the garden, where you can see it from a window.", plant: "lantern" }
  },

  goal: { title: "For the lamp", show: "quest", done: "lit", items: ["thread", "spark", "oil"] },

  pages: {
    fare:    { title: "The fare", text: "The heron's ferry costs one shiny thing. Pell says everything is shiny if you are not a coward." },
    quest:   { title: "Agnes", text: "The lamp needs thread for a wick, a spark that is still warm, and oil. The gun fires at nine. The heron has the oil. Pell knows about thread." },
    spider:  { title: "Thread", text: "The spider at Lost Lagoon spins only in the rain. Or Pell will swap a spool for sea glass, which turns up on the beach at dawn." },
    oil:     { title: "Oil", text: "Mr. Stilt will part with the oil for something grown, not bought. A finished focus round earns a seed for the garden, and a day of growing does the rest. Rain helps." },
    log:     { title: "The log", text: "Forty years, one line a night. Most of the recent ones just say: Window." },
    empress: { title: "The Empress", secret: true, text: "A ship in the fog, all her portholes lit, still trying to get in. Somebody on board plays the piano very badly." },
    tracks:  { title: "Tracks in the snow", secret: true, text: "Small boots and long three-toed feet, side by side, round and round the cherry tree. Forty winters of them." },
    tide:    { title: "The old tide", secret: true, text: "A moonflower on Lost Lagoon, and for one breath the water remembered it used to leave." },
    ending:  { title: "Two lights", text: "Three quick, one slow. You answered." }
  },

  scenes: {
    window: {
      place: "Your window",
      text: [
        "It is {time} in Vancouver: {cond}{temp}.",
        { if: { noflag: "began" }, t: "Across the water, close by the cherry tree, a small light is blinking at you. Three quick, one slow. Three quick, one slow." },
        { if: { noflag: "began" }, t: "You have looked at that shore a thousand times. There has never been anything over there to blink." },
        { if: { flag: "began", noflag: "lit" }, t: "The light is still going, three quick, one slow. You would swear it is dimmer than it was." },
        { if: { flag: "lit", noflag: "done" }, t: "The light across the water burns steady now. Nobody is working the shutter. It is strange how much you mind." },
        { if: { has: "lantern", noflag: "done" }, t: "There is still the matter of the seed in your pocket, or the one in the garden, wherever you have got to with it." },
        { if: { flag: "done" }, t: "The lamp across the water burns steady. Behind you, in the garden, so does yours. Now and then, late, you check." }
      ],
      choices: [
        { label: "Put on your coat and go down to the water", to: "seawall", show: { noflag: "began" }, set: ["began"] },
        { label: "Go down to the water", to: "seawall", show: { flag: "began" } },
        { label: "Go out and look at the lantern plant", to: "twolights", show: { flag: "lit", grown: "lantern", noflag: "done" } },
        { label: "Close the curtain. It is probably nothing.", end: true, show: { noflag: "began" } },
        { label: "Stay in", end: true, show: { flag: "began" } }
      ]
    },

    seawall: {
      place: "The seawall",
      text: [
        { if: { rain: false, snow: false, fog: false, night: false }, t: "The seawall runs along the water, clean and nearly empty. A gull looks you over and files a report." },
        { if: { rain: false, snow: false, fog: false, night: true }, t: "The lamps are on along the wall, each one minding its own small circle." },
        { if: { rain: true }, t: "Rain walks in off English Bay. Nobody else is out, which is how you know this was a good idea." },
        { if: { snow: true }, t: "Snow, in Vancouver. Somewhere a bus has already given up." },
        { if: { fog: true }, t: "Fog has eaten the far shore. You can still see the light, which does not seem right." },
        "Out in the channel the orca comes up, exactly as it does every half a minute, and goes down again. It has never once explained itself."
      ],
      choices: [
        { label: "Walk along to the ferry dock", to: "dock" },
        { label: "Climb down to the beach", to: "beach" },
        { label: "Stop at the crate under the bridge", to: "pell" },
        { label: "Cut through the park to Lost Lagoon", to: "lagoon" },
        { label: "Follow the path out to the old gun", to: "gun" },
        { label: "Go home", end: true }
      ]
    },

    beach: {
      place: "The beach",
      text: [
        "Drift logs lie along the tideline like a very slow traffic jam. The tide has left its usual offerings: kelp, one glove, a smell.",
        { if: { dawn: true }, t: "The tide is far out and the light is low. Every wet stone is pretending to be something better." },
        { if: { lacks: "cap" }, t: "Something in the sand winks at you." }
      ],
      choices: [
        { label: "Dig out whatever is winking", to: "beach", show: { lacks: "cap" }, give: ["cap"],
          say: "A bottle cap. You have held diamonds with less confidence." },
        { label: "Comb the tideline for sea glass", to: "beach",
          show: { flag: "quest", lacks: ["seaglass", "thread"], noflag: "lit" },
          if: { dawn: true }, hint: "only at dawn, when the tide is out", now: "the tide is out",
          give: ["seaglass"], say: "It takes a while. Then there it is, green as a bad idea, and worn perfectly smooth." },
        { label: "Climb back up to the seawall", to: "seawall" }
      ]
    },

    pell: {
      place: "Pell's",
      text: [
        "Under the bridge, a crow has set up shop on an upturned milk crate. The stock: three keys, a hockey pin, half a pair of glasses. A sign reads NO REFUNDS in what may be ketchup.",
        { if: { noflag: "lit" }, t: "'Pell,' says the crow. 'Buying, selling, knowing things. What've you got?'" },
        { if: { flag: "lit" }, t: "'She left owing me four dollars,' says Pell, and looks out at the water for a while. 'Worth every cent.'" }
      ],
      choices: [
        { label: "Ask about the light on the far shore", to: "pell", show: { noflag: "askedLight" },
          set: ["askedLight"], page: "fare",
          say: "'That's the Keeper's light. Been low all year.' She tilts her head. 'Heron'll take you over. Fare's one shiny thing. Everything's shiny if you're not a coward.'" },
        { label: "Ask what she will give you for the bottle cap", to: "pell", show: { has: "cap", noflag: "lit" },
          say: "She turns it over with one foot. 'That's your fare, that is. Don't be a hero.'" },
        { label: "Ask where a person gets thread for a wick", to: "pell",
          show: { flag: "quest", lacks: "thread", noflag: ["lit", "askedThread"] },
          set: ["askedThread"], page: "spider",
          say: "'Spider at the lagoon. Only spins when it's raining. Artists.' She eyes you. 'Or I've a spool here, if you've sea glass. That turns up at dawn, if you're the sort of person who's awake at dawn.'" },
        { label: "Swap the sea glass for her spool of thread", to: "pell",
          show: { has: "seaglass", lacks: "thread", noflag: "lit" },
          take: ["seaglass"], give: ["thread"],
          say: "She holds the glass up to the light and goes quiet for a moment. 'Pleasure,' she says, and sounds as if she means it, which alarms you both." },
        { label: "Back to the seawall", to: "seawall" }
      ]
    },

    lagoon: {
      place: "Lost Lagoon",
      text: [
        "Lost Lagoon sits very still, thinking about something. The swans drift past without comment.",
        { if: { rain: true }, t: "In the rain every reed is strung with silver. A spider the size of a dinner mint is working fast, hauling thread straight out of the falling water." },
        { if: { rain: false }, t: "On the reeds, a spider the size of a dinner mint sits with its legs folded, like someone waiting in for a delivery." }
      ],
      choices: [
        { label: "Ask the spider for a length of thread", to: "lagoon",
          show: { flag: "quest", lacks: "thread", noflag: "lit" },
          if: { rain: true }, hint: "only while it is raining", now: "it is raining",
          give: ["thread"],
          say: "It looks at you with all of its eyes, bites off a length, and hands it over like someone lending you the good scissors." },
        { label: "Set a moonflower cutting on the water", to: "lagoon",
          show: { grown: "moonflower", night: true }, page: "tide",
          say: "It opens as it floats. Every swan turns. For one breath the tide goes out of the lagoon, the way it did before anyone built the causeway: mudflat, stars, the whole bay breathing. Then the water is back, and the swans pretend nothing happened." },
        { label: "Back to the seawall", to: "seawall" }
      ]
    },

    gun: {
      place: "The Nine O'Clock Gun",
      text: [
        "The old cannon squats in its iron cage, pointed at nothing in particular. It has gone off at nine every night for well over a hundred years, and nobody has had the heart to tell it why.",
        { if: { nine: true }, t: "The bang has only just finished rolling round the North Shore. The barrel is ticking as it cools, and a single spark is walking along the rim, looking for someone to go with." },
        { if: { nine: false }, t: "Right now it is cold, and damp, and looks as if it would rather not discuss it." }
      ],
      choices: [
        { label: "Catch the spark in your cupped hands", to: "gun",
          show: { flag: "quest", lacks: "spark", noflag: "lit" },
          if: { nine: true }, hint: "only in the nine o'clock hour", now: "the barrel is still warm",
          give: ["spark"],
          say: "It steps into your hands and sits down. It does not burn. It is, if anything, quite polite." },
        { label: "Back to the seawall", to: "seawall" }
      ]
    },

    dock: {
      place: "The ferry dock",
      text: [
        { if: { noflag: "lit" }, t: "A ferry the size of a bathtub is tied up at the dock. It has been painted several colours, none of them on purpose." },
        { if: { noflag: "lit" }, t: "At the tiller stands a great blue heron in a peaked cap. He looks at you as if you have already disappointed him and he would like it noted." },
        { if: { noflag: ["lit", "crossed"] }, t: "'Mr. Stilt,' he says. 'Far shore. One shiny thing. No singing.'" },
        { if: { flag: "lit" }, t: "The ferry is gone. A rowboat is tied up in its place, with a card on the seat in very upright handwriting: FARE IS ON YOUR HONOUR. SINGING AT OWN RISK." }
      ],
      choices: [
        { label: "Show him the bottle cap", to: "fareshore",
          show: { noflag: ["lit", "crossed"] },
          if: { has: "cap" }, hint: "the fare is one shiny thing",
          set: ["crossed"],
          say: "He inspects it for some time, nods, and gives it back. 'Fare is to be shown,' he says. 'You'd be amazed who hasn't got one.'" },
        { label: "Show him the bottle cap again", to: "fareshore",
          show: { flag: "crossed", noflag: "lit" },
          say: "'Still shiny,' he concedes, and casts off." },
        { label: "Ask about the tin of oil under the seat", to: "stiltoil",
          show: { flag: "quest", lacks: "oil", noflag: "lit" }, page: "oil" },
        { label: "Ask to take the long way, through the fog", to: "empress",
          show: { fog: true, flag: "crossed", noflag: "lit" }, page: "empress" },
        { label: "Row out into the fog", to: "empress", show: { fog: true, flag: "lit" }, page: "empress" },
        { label: "Row across to the far shore", to: "fareshore", show: { flag: "lit" } },
        { label: "Back to the seawall", to: "seawall" }
      ]
    },

    stiltoil: {
      place: "The ferry dock",
      text: [
        "He looks at the tin for a long time, and then at the water.",
        "'Forty years I've carried her oil,' he says. 'In forty years I have not once brought that woman anything she did not need.'",
        "He clears his throat, which in a heron takes a while. 'You may have the tin. For something grown. Not bought. Grown.'"
      ],
      choices: [
        { label: "Give him a cutting from your garden", to: "dock",
          if: { grown: "any" }, hint: "needs a plant you have grown in the garden",
          now: "your garden has grown something",
          give: ["oil"],
          say: "He takes it in his beak as if it might go off, and sets it in a jam jar under the seat where the tin used to be. Neither of you mentions this again." },
        { label: "Leave him to it", to: "dock" }
      ]
    },

    empress: {
      place: "In the fog",
      text: [
        { if: { noflag: "lit" }, t: "The fog shuts behind the ferry like a door. Mr. Stilt cuts the motor without being asked." },
        { if: { flag: "lit" }, t: "The fog shuts behind the rowboat like a door. You ship your oars without quite deciding to." },
        "A bell, the slow kind. Then a wall of dark going by, close enough to touch, and every porthole in it lit. Somebody on board is playing a piano very badly.",
        { if: { noflag: "lit" }, t: "'The Empress,' he says quietly. 'Ninety years she's been trying to get in. That light is the only reason she still tries.' He takes off his cap until she has gone." },
        { if: { flag: "lit" }, t: "Then she has gone, and the water closes, and the light on the far shore is exactly where it should be." }
      ],
      choices: [
        { label: "Come back to the dock", to: "dock" }
      ]
    },

    fareshore: {
      place: "The far shore",
      text: [
        "The boat grounds on the shingle with a sigh. From here your own window is one small yellow square on the other side, and it does look as if someone is home.",
        { if: { season: "spring" }, t: "The cherry tree is in full blossom and shedding it on everything, the shingle and the water and you." },
        { if: { season: "summer" }, t: "The cherry tree is heavy and dark. Something has been eating the fruit and is not sorry." },
        { if: { season: "autumn" }, t: "The cherry tree has gone amber and is letting go of it, one leaf at a time, in no hurry." },
        { if: { season: "winter" }, t: "The cherry tree is bare, and somehow looks stronger for it." },
        { if: { noflag: "lit" }, t: "Behind it, hidden from the far side by the firs, stands a lighthouse barely taller than a bus shelter. The blinking is coming from the top." },
        { if: { flag: "lit" }, t: "Behind it stands the little lighthouse, its lamp burning on with nobody to tell it to." }
      ],
      choices: [
        { label: "Go up to the lighthouse door", to: "door" },
        { label: "Look at the tracks under the tree", to: "tracks", show: { snow: true }, page: "tracks" },
        { label: "Go back across", to: "dock" }
      ]
    },

    tracks: {
      place: "Under the cherry tree",
      text: [
        "The snow is printed with tracks: one pair of small boots, and beside them, exactly in step, one long three-toed foot, and another.",
        "They go round the tree, and round again, and they stop at the place where a person would stop to look at the view.",
        "Nobody has ever mentioned this to you. You decide nobody ever will."
      ],
      choices: [
        { label: "Leave them as they are", to: "fareshore" }
      ]
    },

    door: {
      place: "The lighthouse door",
      text: [
        { if: { noflag: "doorOpen" }, t: "There is no handle. There is a brass knocker, worn bright in one spot, and a card pinned above it in a shaky hand: ANSWER THE LIGHT." },
        { if: { flag: "doorOpen", noflag: "lit" }, t: "The door is on the latch, as if somebody has stopped bothering to pretend." },
        { if: { flag: "lit" }, t: "The door stands open. Somebody has swept the step." }
      ],
      choices: [
        { label: "Knock three times, quickly", to: "door", show: { noflag: "doorOpen" },
          say: "Silence. From somewhere above comes the sound of a person sighing with great patience." },
        { label: "Knock once, slowly", to: "door", show: { noflag: "doorOpen" },
          say: "Silence. A small amount of dust comes down, disappointed." },
        { label: "Knock three quick, one slow", to: "lamproom", show: { noflag: "doorOpen" }, set: ["doorOpen"],
          say: "The door swings in. It was never locked. It was waiting to see if you had been paying attention." },
        { label: "Apologise to the door", to: "door", show: { noflag: "doorOpen" },
          say: "It accepts this, but does not open. That is between you and it." },
        { label: "Go in", to: "lamproom", show: { flag: "doorOpen" } },
        { label: "Back down to the shore", to: "fareshore" }
      ]
    },

    lamproom: {
      place: "The lamp room",
      text: [
        { if: { noflag: "quest" }, t: "Up a stair built for someone smaller, and there it is: a brass lamp no bigger than a teapot. Beside it, on a kitchen chair, sits a very small, very old woman in a cardigan, working the shutter by hand. Three quick, one slow." },
        { if: { noflag: "quest" }, t: "'Oh, good,' she says, without stopping. 'I've been blinking at you for eleven years. Do you know what that does to a wrist?'" },
        { if: { flag: "quest", noflag: "lit" }, t: "Agnes works the shutter. The flame behind it has gone small and blue at the edges." },
        { if: { flag: "quest", noflag: "lit", night: true }, t: "'Up late again,' she says, not looking round." },
        { if: { flag: "quest", noflag: "lit", rain: true }, t: "'Wet out,' she says, looking at your coat. 'Good. It's the wet nights they need it.'" },
        { if: { has: ["thread", "spark", "oil"], noflag: "lit" }, t: "She has stopped looking at the lamp. She is looking at your pockets." },
        { if: { flag: "lit" }, t: "The chair is empty. The lamp burns on by itself. The logbook lies open on the seat at a new page, with one line in a shaky hand:" },
        { if: { flag: "lit" }, t: "Clear. One boat. Window. Thank you." }
      ],
      choices: [
        { label: "Ask her who she is", to: "agnes", show: { noflag: "quest" } },
        { label: "Put the thread, the oil and the spark on the table", to: "relight",
          show: { has: ["thread", "spark", "oil"], noflag: "lit" } },
        { label: "Read the logbook", to: "log", show: { flag: "quest", noflag: "lit" }, page: "log" },
        { label: "Go back down", to: "fareshore" }
      ]
    },

    agnes: {
      place: "The lamp room",
      text: [
        "'Agnes. I keep the light. It tells the boats where the shore is, and it tells the people at windows that somebody else is up.'",
        "The flame ticks. Up close it is much too small for the work it is doing.",
        "'It's dying, is what it's doing. It wants thread for a wick, a spark that's still warm, and oil. The gun will see to your spark, if you're there at nine. Pell knows about thread. The oil's with the heron, and he's being a fool about it.'",
        "She looks at you properly for the first time. 'Bring me those and I'll tell you the rest.'"
      ],
      choices: [
        { label: "Say you will find them", to: "lamproom", set: ["quest"], page: "quest" }
      ]
    },

    log: {
      place: "The logbook",
      text: [
        "One line a night, for forty years, in the same hand. 'Clear. Two boats.' 'Rain. Tug in trouble off the point, got in.' 'Fog. Nobody. Kept it going anyway.'",
        "Then, some years back, a new word starts turning up at the end of the lines. 'Rain. No boats. Window.' 'Clear. Window.' You turn to last week. Window. Window. Window.",
        "'That's you,' says Agnes, working the shutter. 'Best-attended window on the inlet. All those late nights, you thought you were the only one up.'",
        "She does not look round. 'You weren't. You didn't know that. That's how you know it worked.'"
      ],
      choices: [
        { label: "Close the book", to: "lamproom" }
      ]
    },

    relight: {
      place: "The lamp room",
      text: [
        "She lets you do it. The thread goes in as a wick. The oil goes in after it, forty years of the same smell. You open your hands, and the spark looks round the room, and steps across by itself.",
        "The lamp takes a breath. For one second the whole inlet goes gold: the water, the firs, the undersides of the gulls, one small yellow window on the other side.",
        "'There,' says Agnes. She lets go of the shutter, and her hand stays curled around nothing. It is the first time it has been still since before you were born.",
        "'Now, the rest. That stair is no joke, and there's a heron who thinks I don't know. It doesn't need this tower, you see. It only needs somebody who'll keep one going where somebody else can see it.'",
        "She takes a seed from her cardigan and folds your fingers over it. 'Plant it where you'd see it from a window. It isn't fussy. It only wants looking after.'"
      ],
      choices: [
        { label: "Help her down the stairs", to: "farewell", take: ["thread", "spark", "oil"], give: ["lantern"], set: ["lit"] }
      ]
    },

    farewell: {
      place: "The far shore",
      text: [
        "Mr. Stilt is at the tiller with his cap in his wing. On the seat beside him stands a jam jar, and in the jar, your flower.",
        "Agnes looks at the jar. She looks at the heron. She looks at the heron for quite some time.",
        "'Forty years,' she says, and gets in.",
        "They set you down at your own dock, and he hands you up with great formality. Then the ferry the size of a bathtub turns its nose toward open water, going very slowly and in no particular direction.",
        "'No singing,' says Mr. Stilt.",
        "Agnes starts to sing. He does not stop her."
      ],
      choices: [
        { label: "Walk home", end: true }
      ]
    },

    twolights: {
      place: "The garden",
      text: [
        "The lantern plant has opened on the island: one small warm globe on a stalk, asking nothing of anyone.",
        "You bring a chair out. Far off past the rocks, a boat the size of a bathtub is going nowhere, slowly, with a little lamp at its bow. It is much too far to hear anything. You listen anyway.",
        "You cup your hand around the lantern and take it away, and cup it again. Three quick. One slow.",
        "Out on the water the little lamp stops. Then it starts up again, much too fast, all over the place. You would swear it was laughing."
      ],
      choices: [
        { label: "Stay out a while longer", end: true, set: ["done"], page: "ending" }
      ]
    }
  }
};
