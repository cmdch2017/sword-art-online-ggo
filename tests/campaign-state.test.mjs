import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_PHASE,
  advanceCampaign,
  createCampaignState,
  currentZone
} from "../src/campaign-state.mjs";

const zones = [
  {
    id: "ggo-harbor",
    objectiveCount: 2,
    boss: { id: "noctis" }
  },
  {
    id: "alo-sky",
    objectiveCount: 1,
    boss: { id: "wind-guardian" }
  },
  {
    id: "world-tree-core",
    objectiveCount: 2,
    boss: { id: "yggdrasil-core" }
  }
];

test("campaign starts in the first zone objectives phase", () => {
  const campaign = createCampaignState(zones);

  assert.equal(campaign.zoneIndex, 0);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);
  assert.equal(campaign.objectivesDone, 0);
  assert.deepEqual(campaign.completedZoneIds, []);
  assert.equal(campaign.finalVictory, false);
  assert.equal(currentZone(campaign, zones).id, "ggo-harbor");
});

test("objective events clamp at the configured count and advance to boss", () => {
  const campaign = createCampaignState(zones);

  advanceCampaign(campaign, "objective");
  assert.equal(campaign.objectivesDone, 1);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);

  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");
  assert.equal(campaign.objectivesDone, 2);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.BOSS);
});

test("boss completion opens extraction and extraction advances zones", () => {
  const campaign = createCampaignState(zones);
  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");

  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);

  advanceCampaign(campaign, "extraction");
  assert.deepEqual(campaign.completedZoneIds, ["ggo-harbor"]);
  assert.equal(campaign.zoneIndex, 1);
  assert.equal(campaign.objectivesDone, 0);
  assert.equal(campaign.phase, CAMPAIGN_PHASE.OBJECTIVES);
  assert.equal(currentZone(campaign, zones).id, "alo-sky");
  assert.equal(campaign.finalVictory, false);
});

test("only the final zone extraction produces global victory", () => {
  const campaign = createCampaignState(zones);

  for (const [index, zone] of zones.entries()) {
    for (let objective = 0; objective < zone.objectiveCount; objective += 1) {
      advanceCampaign(campaign, "objective");
    }
    advanceCampaign(campaign, "boss");
    advanceCampaign(campaign, "extraction");
    if (index < zones.length - 1) {
      assert.equal(campaign.finalVictory, false);
    }
  }

  assert.equal(campaign.phase, CAMPAIGN_PHASE.VICTORY);
  assert.equal(campaign.finalVictory, true);
  assert.deepEqual(campaign.completedZoneIds, zones.map((zone) => zone.id));
  assert.equal(currentZone(campaign, zones), null);
});

test("invalid and repeated phase events do not mutate the campaign", () => {
  const campaign = createCampaignState(zones);
  const before = structuredClone(campaign);

  advanceCampaign(campaign, "boss");
  advanceCampaign(campaign, "extraction");
  assert.deepEqual(campaign, before);

  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "objective");
  advanceCampaign(campaign, "boss");
  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
});

test("a zone without a boss proceeds directly from objectives to extraction", () => {
  const campaign = createCampaignState([
    { id: "no-boss", objectiveCount: 1, boss: null },
    { id: "final", objectiveCount: 1, boss: null }
  ]);

  advanceCampaign(campaign, "objective");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
  advanceCampaign(campaign, "boss");
  assert.equal(campaign.phase, CAMPAIGN_PHASE.EXTRACTION);
});
