// What a bench would actually do about a red light.
//
// The funnel currently ends the conversation at the red light, which is the one
// moment it has the student's full attention. No working lab concludes
// "impossible" from two incompatible steps; it picks one of a short list of
// moves, each with a known price. A dead shared window does not mean the
// chemistry cannot be done. It means one option is off the table — running both
// enzymes in the same pot at the same time — and that is worth saying in those
// words.
//
// Every remedy here carries its cost. A toy that offers a free lunch teaches the
// wrong lesson, and the costs are the part a student will not guess.

// Each remedy: what it is, what it costs, and whether this toy can show it.
// `shown` marks the ones the app can actually demonstrate rather than only
// describe, so the UI can separate "try this here" from "this takes a lab".
export const REMEDIES = {
  temp: {
    headline: 'Not a one-pot',
    restatement:
      'These stages have no temperature they will all run at together. That rules out running them concurrently in one vessel. It does not rule out the chemistry.',
    options: [
      {
        id: 'sequential',
        label: 'Separate them in time',
        what: 'Run the first stage to completion, change the pot, then add the next enzyme.',
        cost: 'Longer, more handling, and the intermediate sits exposed between stages.',
        shown: true,
      },
      {
        id: 'spatial',
        label: 'Separate them in space',
        what: 'Hold each enzyme on its own support, split them with a membrane, or run two beds at different temperatures in flow.',
        cost: 'You pay in mass transfer, and you lose material between stages.',
        shown: true,
      },
      {
        id: 'variant',
        label: 'Use a different version of the same enzyme',
        what: 'The same activity exists in organisms that live hotter or colder. Thermostable amylases and polymerases came out of exactly this search.',
        cost: 'A version from another organism may not like your substrate, and for some activities it simply has not been found.',
        shown: true,
      },
      {
        id: 'engineer',
        label: 'Change the enzyme itself',
        what: 'Directed evolution or computational stabilisation can move an operating range.',
        cost: 'Weeks of laboratory work, and the rigidity that buys stability often costs activity at lower temperatures.',
        shown: false,
      },
      {
        id: 'compromise',
        label: 'Accept a worse condition',
        what: 'Pick a point where every stage runs slowly, and make up the difference with more enzyme or more time.',
        cost: 'Slower and less efficient. This is the move nobody teaches and the one most often used.',
        shown: true,
      },
    ],
  },

  ph: {
    headline: 'Not a one-pot',
    restatement:
      'These stages have no pH they will all run at together. Same conclusion as a dead temperature window: concurrent operation is out, the chemistry is not.',
    options: [
      {
        id: 'sequential',
        label: 'Separate them in time',
        what: 'Run one stage, adjust the pot, add the next. Changing pH between stages is easier than changing temperature.',
        cost: 'Longer, and every adjustment dilutes and adds salt.',
        shown: true,
      },
      {
        id: 'spatial',
        label: 'Separate them in space',
        what: 'Compartments are how cells solve this. Different organelles hold different pH, and keeping incompatible chemistry apart is most of what a membrane is for.',
        cost: 'Mass transfer again, plus whatever holds the compartments apart.',
        shown: true,
      },
      {
        id: 'variant',
        label: 'Use a different version of the same enzyme',
        what: 'Alkaline proteases in laundry detergent exist because somebody went looking in a soda lake.',
        cost: 'Substrate preference may differ, and the version you want may not exist.',
        shown: true,
      },
      {
        id: 'immobilise',
        label: 'Immobilise one of them',
        what: 'Binding an enzyme to a support frequently shifts its apparent pH optimum, which is sometimes the whole reason to do it.',
        cost: 'Access to the active site gets worse, and the shift is not something you can order to spec.',
        shown: false,
      },
      {
        id: 'compromise',
        label: 'Accept a worse condition',
        what: 'Both stages run slowly at a shared point. Often the right answer.',
        cost: 'Slower, more enzyme, lower yield.',
        shown: true,
      },
    ],
  },

  cofactor: {
    headline: 'A pool gets used up',
    restatement: 'One stage consumes something a later stage still needs. The lane does not fail at the first step; it fails partway through, once the pool is gone.',
    options: [
      {
        id: 'reorder',
        label: 'Reorder the stages',
        what: 'Put the stage that needs the cofactor before the one that consumes it. The check is order-sensitive on purpose.',
        cost: 'Only works if the chemistry allows the other order.',
        shown: true,
      },
      {
        id: 'regenerate',
        label: 'Add a regeneration stage',
        what: 'Bring in an enzyme that puts the spent cofactor back, so the pool turns over instead of draining.',
        cost: 'Another enzyme, another co-substrate, and more to go wrong.',
        shown: true,
      },
      {
        id: 'excess',
        label: 'Feed it in excess',
        what: 'Supply enough of the cofactor that running it down does not matter over the run.',
        cost: 'Expensive, and the spent form usually inhibits something.',
        shown: false,
      },
      {
        id: 'sequential',
        label: 'Separate them in time',
        what: 'Finish the stage that needs the cofactor before the consumer ever meets it.',
        cost: 'Longer, more handling.',
        shown: true,
      },
    ],
  },

  inhibition: {
    headline: 'A product gets in the way',
    restatement: 'A later stage frees something an earlier stage is listed as sensitive to. This is a slowdown that gets worse as the run proceeds, not a hard stop.',
    options: [
      {
        id: 'remove',
        label: 'Take the product away',
        what: 'Trap it, precipitate it, extract it, or add a stage that consumes it. Removing a product is also what pulls an unfavourable step forward.',
        cost: 'More equipment, and whatever removes it has to not interfere with everything else.',
        shown: true,
      },
      {
        id: 'sequential',
        label: 'Separate them in time',
        what: 'Run the sensitive stage to completion before the one that frees the inhibitor starts.',
        cost: 'Longer, and the intermediate is exposed in between.',
        shown: true,
      },
      {
        id: 'proximity',
        label: 'Hold the enzymes close together',
        what: 'Keeping the stages adjacent means the intermediate is consumed near where it was made. This is the case where proximity genuinely buys something.',
        cost: 'You have to build the assembly, and for a stable intermediate it buys close to nothing.',
        shown: true,
      },
      {
        id: 'dilute',
        label: 'Run more dilute',
        what: 'Less inhibitor accumulates per unit volume.',
        cost: 'Everything gets slower, and you handle more liquid for the same product.',
        shown: false,
      },
    ],
  },

  ledger: {
    headline: 'The lane does not pay its own way',
    restatement: 'This lane spends group donors and nothing puts them back. It will run until the pool is gone and then stop.',
    options: [
      {
        id: 'regenerate',
        label: 'Add a regeneration stage',
        what: 'A stage that takes the spent form back in and hands the loaded form out turns the pool over instead of draining it.',
        cost: 'Another enzyme and another co-substrate to supply.',
        shown: true,
      },
      {
        id: 'excess',
        label: 'Supply the donor in excess',
        what: 'Accept that it is consumed and feed enough for the whole run.',
        cost: 'Group donors are the expensive part of most cascades.',
        shown: false,
      },
      {
        id: 'shorten',
        label: 'Drop a stage that spends it',
        what: 'Fewer donor-consuming stages, less to replace.',
        cost: 'You lose whatever that stage was doing.',
        shown: true,
      },
    ],
  },

  kinetics: {
    headline: 'The intermediate piles up',
    restatement: 'A stage is making its product faster than the next stage can clear it. The lane still works; it just accumulates something in the middle, and that is where routes usually go wrong.',
    options: [
      {
        id: 'more-enzyme',
        label: 'Use more of the slow enzyme',
        what: 'The cheapest fix: load the bottleneck stage heavily enough to keep up.',
        cost: 'More enzyme, and the bottleneck is usually the expensive one.',
        shown: true,
      },
      {
        id: 'reorder',
        label: 'Reorder, if the chemistry allows',
        what: 'A slow step hurts least when it is first and nothing is waiting behind it.',
        cost: 'Rarely possible; the order is usually set by the chemistry.',
        shown: true,
      },
      {
        id: 'proximity',
        label: 'Hold the stages close together',
        what: 'A short hop from where the intermediate is made to where it is consumed gives it less chance to decompose or inhibit anything.',
        cost: 'You have to build the assembly, and it only helps for an intermediate that is actually fragile.',
        shown: true,
      },
      {
        id: 'feed',
        label: 'Feed the first stage slowly',
        what: 'Meter the substrate in so the fast stage cannot outrun the slow one.',
        cost: 'Longer run for the same amount of product.',
        shown: true,
      },
    ],
  },

  host: {
    headline: 'Nothing here could make it',
    restatement:
      'This is upstream of all the chemistry. One of these enzymes needs something the chosen host cannot supply, so the construct would never exist to be tested.',
    options: [
      {
        id: 'another-host',
        label: 'Pick a host that can',
        what: 'A eukaryote brings a secretory pathway, sugars, membranes and heme. The periplasm brings an oxidising compartment without leaving bacteria.',
        cost: 'Slower, more expensive, and more to learn. The cheapest host is cheapest for a reason.',
        shown: true,
      },
      {
        id: 'cell-free',
        label: 'Drop the cell',
        what: 'Cell-free lets you set the conditions and add what you like, including metals and heme.',
        cost: 'Nothing is secreted, nothing is glycosylated, and there is no membrane to sit in, so it fixes some requirements and not others.',
        shown: true,
      },
      {
        id: 'swap-stage',
        label: 'Use a different enzyme for that step',
        what: 'Another entry doing the same job may not carry the requirement that is blocking you.',
        cost: 'Its windows and speed will differ, so the rest of the lane has to be rechecked.',
        shown: true,
      },
    ],
  },

  drive: {
    headline: 'A step barely goes',
    restatement: 'One stage sits near or against its own equilibrium. A fast enzyme does not help: the reaction has no reason to go forward on its own.',
    options: [
      {
        id: 'pull',
        label: 'Let the next stage pull it',
        what: 'A downstream stage that consumes the product keeps the concentration low and drags the uphill step forward. This is why cascades work at all.',
        cost: 'None, if the lane already has such a stage. This is the elegant answer.',
        shown: true,
      },
      {
        id: 'couple',
        label: 'Couple it to something downhill',
        what: 'Spend a group donor to pay for the step. This is most of what ATP is for.',
        cost: 'A donor consumed per turnover, which the ledger then has to balance.',
        shown: true,
      },
      {
        id: 'concentration',
        label: 'Push with substrate',
        what: 'A high enough substrate concentration moves an unfavourable equilibrium along.',
        cost: 'Wasteful, and the substrate often inhibits something at that concentration.',
        shown: false,
      },
    ],
  },
};

export function remediesFor(lightId) {
  return REMEDIES[lightId] ?? null;
}

// Only the moves this app can actually demonstrate, for the "try this" row.
export function shownRemedies(lightId) {
  const r = remediesFor(lightId);
  return r ? r.options.filter((o) => o.shown) : [];
}

// Every remedy, including the ones that take a laboratory, for the full panel.
export function allRemedies(lightId) {
  const r = remediesFor(lightId);
  return r ? r.options : [];
}

// The lights this file has an answer for. Used by a test, so that a new light
// added to the model cannot quietly ship without one.
export const COVERED_LIGHTS = Object.keys(REMEDIES);
