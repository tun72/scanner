import { MAX_NUTRIENT_HIGHLIGHTS, NUTRIENT_IDS, type NutrientHighlight, type NutrientId } from '@food-scanner/contracts';

const normalize = (name: string) => name.normalize('NFC').trim().toLowerCase();

// Match simple ingredient names only. A dish name or a possible ingredient is insufficient evidence.
const ingredientSources: { names: string[]; nutrients: NutrientId[] }[] = [
  { names: ['milk', 'cow’s milk', "cow's milk", 'နွားနို့', 'နို့'], nutrients: ['calcium', 'protein'] },
  { names: ['plain yogurt', 'yogurt', 'yoghurt', 'ဒိန်ချဉ်'], nutrients: ['calcium', 'protein'] },
  { names: ['lentil', 'lentils', 'ပဲနီလေး', 'ကုလားပဲ', 'chickpeas', 'chickpea'], nutrients: ['iron', 'protein', 'fiber'] },
  { names: ['spinach', 'ဟင်းနုနွယ်', 'ဟင်းနုနွယ်ရွက်'], nutrients: ['iron', 'fiber'] },
  { names: ['banana', 'bananas', 'ငှက်ပျောသီး'], nutrients: ['potassium'] },
  { names: ['potato', 'potatoes', 'အာလူး'], nutrients: ['potassium'] },
  { names: ['orange', 'oranges', 'လိမ္မော်သီး', 'broccoli', 'ပန်းဂေါ်ဖီစိမ်း', 'ဘရိုကိုလီ'], nutrients: ['vitamin-c'] },
  { names: ['egg', 'eggs', 'boiled egg', 'ကြက်ဥ', 'ကြက်ဥပြုတ်', 'chicken', 'ကြက်သား', 'fish', 'ငါး', 'ငါးသား'], nutrients: ['protein'] },
];
const nutrientsByIngredient = new Map(ingredientSources.flatMap(({ names, nutrients }) =>
  names.map(name => [normalize(name), nutrients] as const),
));

export function highlightsFromPhoto(ingredients: { name: string; evidence: 'seen' | 'possible' }[]): NutrientHighlight[] {
  const sources = new Map<NutrientId, string>();
  for (const { name, evidence } of ingredients) {
    if (evidence !== 'seen') continue;
    for (const nutrient of nutrientsByIngredient.get(normalize(name)) ?? []) {
      if (!sources.has(nutrient)) sources.set(nutrient, name);
    }
  }
  return NUTRIENT_IDS.flatMap<NutrientHighlight>(nutrient => {
    const ingredient = sources.get(nutrient);
    return ingredient ? [{ nutrient, source: 'photo', ingredient }] : [];
  }).slice(0, MAX_NUTRIENT_HIGHLIGHTS);
}

export function highlightsFromProduct(reported: NutrientId[]): NutrientHighlight[] {
  return NUTRIENT_IDS.filter(nutrient => reported.includes(nutrient)).slice(0, MAX_NUTRIENT_HIGHLIGHTS)
    .map(nutrient => ({ nutrient, source: 'open-food-facts' }));
}
