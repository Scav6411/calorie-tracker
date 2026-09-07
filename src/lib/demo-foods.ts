import type { FoodItem } from '@/lib/meals'

// Mirrors the seeded global catalogue so /demo behaves like the real thing
// without a session. Nothing here touches the database.

const CATALOGUE: Array<[string, string, number]> = [
  ['Roti', 'piece', 104],
  ['Rice (cooked)', '100g', 130],
  ['Dal', 'bowl', 180],
  ['Rajma curry', 'bowl', 240],
  ['Chole', 'bowl', 260],
  ['Paneer butter masala', 'bowl', 340],
  ['Chicken curry', 'bowl', 290],
  ['Chicken breast (cooked)', '100g', 165],
  ['Chicken biryani', 'plate', 490],
  ['Egg (boiled)', 'egg', 78],
  ['Omelette (2 eggs)', 'serving', 220],
  ['Idli', 'piece', 58],
  ['Dosa (plain)', 'piece', 168],
  ['Sambar', 'bowl', 140],
  ['Poha', 'bowl', 250],
  ['Upma', 'bowl', 270],
  ['Oats with milk', 'bowl', 220],
  ['Paneer (raw)', '100g', 265],
  ['Curd', 'bowl', 100],
  ['Milk (toned)', 'glass', 120],
  ['Banana', 'piece', 105],
  ['Apple', 'piece', 95],
  ['Almonds', '10 pieces', 70],
  ['Peanut butter', 'tbsp', 94],
  ['Bread slice', 'slice', 66],
  ['Butter', 'tsp', 34],
  ['Protein shake', 'scoop', 120],
  ['Samosa', 'piece', 262],
  ['Tea with milk', 'cup', 90],
  ['Coffee with milk', 'cup', 60],
]

const DEMO_FOODS: FoodItem[] = CATALOGUE.map(([name, unit, kcal], index) => ({
  id: `demo-food-${index}`,
  name,
  default_unit: unit,
  calories_per_unit: kcal,
  is_personal: false,
}))

/** Foods the user "added" during this demo session, kept in memory. */
const sessionFoods: FoodItem[] = []

function bigrams(value: string) {
  const padded = ` ${value.toLowerCase().trim()} `
  const out: string[] = []
  for (let i = 0; i < padded.length - 1; i += 1) out.push(padded.slice(i, i + 2))
  return out
}

/** Rough stand-in for the trigram similarity the real search uses. */
function similarity(query: string, name: string) {
  const a = bigrams(query)
  const b = new Set(bigrams(name))
  if (a.length === 0) return 0
  return a.filter((gram) => b.has(gram)).length / a.length
}

export function demoSearchFoods(query: string, limit = 10): FoodItem[] {
  const term = query.trim().toLowerCase()
  const all = [...sessionFoods, ...DEMO_FOODS]
  if (term === '') return all.slice(0, limit)

  return all
    .map((food) => ({ food, score: similarity(term, food.name) }))
    .filter(({ food, score }) => food.name.toLowerCase().includes(term) || score >= 0.4)
    .sort((left, right) => {
      if (left.food.is_personal !== right.food.is_personal) return left.food.is_personal ? -1 : 1
      const leftStarts = left.food.name.toLowerCase().startsWith(term)
      const rightStarts = right.food.name.toLowerCase().startsWith(term)
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1
      return right.score - left.score
    })
    .slice(0, limit)
    .map(({ food }) => food)
}

export function demoCreateFood(input: {
  name: string
  caloriesPerUnit: number
  unit?: string
}): FoodItem {
  const food: FoodItem = {
    id: `demo-food-new-${sessionFoods.length}`,
    name: input.name.trim(),
    default_unit: input.unit?.trim() || 'serving',
    calories_per_unit: input.caloriesPerUnit,
    is_personal: true,
  }
  sessionFoods.unshift(food)
  return food
}
