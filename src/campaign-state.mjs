export const CAMPAIGN_PHASE = Object.freeze({
  OBJECTIVES: "objectives",
  BOSS: "boss",
  EXTRACTION: "extraction",
  VICTORY: "victory"
});

function assertZones(zones) {
  if (!Array.isArray(zones) || zones.length === 0) {
    throw new TypeError("campaign requires at least one zone");
  }
  for (const zone of zones) {
    if (!zone?.id || !Number.isInteger(zone.objectiveCount) || zone.objectiveCount < 1) {
      throw new TypeError("each campaign zone requires an id and positive objectiveCount");
    }
  }
}

export function createCampaignState(zones) {
  assertZones(zones);
  return {
    zoneIndex: 0,
    phase: CAMPAIGN_PHASE.OBJECTIVES,
    objectivesDone: 0,
    completedZoneIds: [],
    finalVictory: false,
    zoneIds: zones.map((zone) => zone.id),
    zoneObjectiveCounts: zones.map((zone) => zone.objectiveCount),
    zoneBossFlags: zones.map((zone) => Boolean(zone.boss))
  };
}

export function currentZone(campaign, zones) {
  if (campaign.finalVictory) return null;
  return zones[campaign.zoneIndex] ?? null;
}

export function advanceCampaign(campaign, event) {
  if (!campaign || campaign.finalVictory) return campaign;
  const objectiveCount = campaign.zoneObjectiveCounts[campaign.zoneIndex];
  const hasBoss = campaign.zoneBossFlags[campaign.zoneIndex];

  if (event === "objective" && campaign.phase === CAMPAIGN_PHASE.OBJECTIVES) {
    campaign.objectivesDone = Math.min(objectiveCount, campaign.objectivesDone + 1);
    if (campaign.objectivesDone === objectiveCount) {
      campaign.phase = hasBoss
        ? CAMPAIGN_PHASE.BOSS
        : CAMPAIGN_PHASE.EXTRACTION;
    }
    return campaign;
  }

  if (event === "boss" && campaign.phase === CAMPAIGN_PHASE.BOSS) {
    campaign.phase = CAMPAIGN_PHASE.EXTRACTION;
    return campaign;
  }

  if (event === "extraction" && campaign.phase === CAMPAIGN_PHASE.EXTRACTION) {
    campaign.completedZoneIds.push(campaign.zoneIds[campaign.zoneIndex]);
    if (campaign.zoneIndex === campaign.zoneIds.length - 1) {
      campaign.phase = CAMPAIGN_PHASE.VICTORY;
      campaign.finalVictory = true;
      return campaign;
    }
    campaign.zoneIndex += 1;
    campaign.objectivesDone = 0;
    campaign.phase = CAMPAIGN_PHASE.OBJECTIVES;
  }

  return campaign;
}
