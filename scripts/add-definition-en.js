const fs = require("fs");
const path = require("path");

const TERMS_PATH = path.join(__dirname, "..", "terms.json");

const TRANSLATIONS = {
  "p-value": "A number showing how likely it is that the observed result happened purely by chance. The smaller the p-value, the less likely chance alone explains it.",
  "correlation": "A measure of how two variables move together — when one goes up, the other tends to go up (or down) too. Correlation does not by itself prove that one causes the other.",
  "regression": "A statistical method that estimates how much, and in what direction, one or more variables affect another variable, expressed as an equation.",
  "effect-size": "A number that captures how large a difference or relationship actually is, beyond just whether it's statistically significant.",
  "confidence-interval": "A range of values within which the true value being estimated is likely to fall, given a stated level of confidence (e.g., 95%).",
  "standard-deviation": "A measure of how spread out data is around the mean, calculated as the square root of the variance so it's back in the original unit.",
  "sample-size": "The number of people (or observations) actually included in a study, usually denoted by n.",
  "t-test": "A statistical test that checks whether the difference between the means of two groups is likely to be real or just due to chance.",
  "anova": "A statistical technique (Analysis of Variance) used to compare the means of three or more groups at the same time.",
  "chi-square-test": "A statistical test used to check whether there is an association between categorical variables.",
  "variance": "A measure of how far data points are spread out from the mean; its square root is the standard deviation.",
  "null-hypothesis": "The default assumption that there is no effect or no difference, which a statistical test tries to reject.",
  "qualitative-research": "A research approach that explores experiences, emotions, and context in depth through methods like interviews and observation, rather than numerical measurement.",
  "literature-review": "A systematic summary and evaluation of existing research on a topic.",
  "peer-review": "The pre-publication process in which experts in the same field evaluate a paper's quality and validity.",
  "control-group": "The group in an experiment that does not receive the treatment being tested, used as a baseline for comparison.",
  "meta-analysis": "A research method that statistically combines results from multiple individual studies on the same topic to reach an overall conclusion.",
  "reliability": "The degree to which a measurement produces consistent results when repeated under the same conditions.",
  "validity": "The degree to which a measurement tool actually measures the concept it is intended to measure.",
  "confounding-variable": "A hidden third variable that affects both the presumed cause and the outcome, making it look like there's a relationship between them even when there isn't.",
  "longitudinal-study": "A study that observes the same subjects repeatedly over time to track how they change.",
  "cross-sectional-study": "A study that examines multiple subjects at a single point in time for comparison.",
  "significance-level": "A threshold, chosen in advance by the researcher (commonly denoted α), below which a result is considered too unlikely to be due to chance alone.",
  "rct": "A randomized controlled trial: an experiment where participants are randomly assigned to a treatment group or a control group, considered one of the most reliable ways to establish cause and effect.",
  "selection-bias": "A bias that arises when a sample fails to represent the population evenly, systematically over- or under-including subjects with certain characteristics.",
  "publication-bias": "The tendency for studies with statistically significant results to get published more often than studies without them.",
  "likert-scale": "A survey scale that asks respondents to rate their level of agreement across several ordered levels (e.g., strongly disagree to strongly agree).",
};

function main() {
  const terms = JSON.parse(fs.readFileSync(TERMS_PATH, "utf8"));
  let updated = 0;

  for (const term of terms) {
    if (TRANSLATIONS[term.slug]) {
      term.definition_en = TRANSLATIONS[term.slug];
      updated += 1;
    }
  }

  const missing = Object.keys(TRANSLATIONS).filter(
    (slug) => !terms.some((t) => t.slug === slug)
  );
  if (missing.length > 0) {
    throw new Error(`terms.json에 없는 slug: ${missing.join(", ")}`);
  }

  fs.writeFileSync(TERMS_PATH, JSON.stringify(terms, null, 2) + "\n", "utf8");
  console.log(`definition_en 추가: ${updated}개`);
}

main();
