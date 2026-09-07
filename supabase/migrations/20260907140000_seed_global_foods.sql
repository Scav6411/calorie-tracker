-- Starter catalogue so search returns something from day one. These are global
-- rows (user_id null): readable by everyone, writable by no one.
-- Idempotent via the global unique index on lower(name).

insert into public.food_items (user_id, name, default_unit, calories_per_unit) values
  (null, 'Roti', 'piece', 104),
  (null, 'Rice (cooked)', '100g', 130),
  (null, 'Dal', 'bowl', 180),
  (null, 'Rajma curry', 'bowl', 240),
  (null, 'Chole', 'bowl', 260),
  (null, 'Paneer butter masala', 'bowl', 340),
  (null, 'Chicken curry', 'bowl', 290),
  (null, 'Chicken breast (cooked)', '100g', 165),
  (null, 'Chicken biryani', 'plate', 490),
  (null, 'Egg (boiled)', 'egg', 78),
  (null, 'Omelette (2 eggs)', 'serving', 220),
  (null, 'Idli', 'piece', 58),
  (null, 'Dosa (plain)', 'piece', 168),
  (null, 'Sambar', 'bowl', 140),
  (null, 'Poha', 'bowl', 250),
  (null, 'Upma', 'bowl', 270),
  (null, 'Oats with milk', 'bowl', 220),
  (null, 'Paneer (raw)', '100g', 265),
  (null, 'Curd', 'bowl', 100),
  (null, 'Milk (toned)', 'glass', 120),
  (null, 'Banana', 'piece', 105),
  (null, 'Apple', 'piece', 95),
  (null, 'Almonds', '10 pieces', 70),
  (null, 'Peanut butter', 'tbsp', 94),
  (null, 'Bread slice', 'slice', 66),
  (null, 'Butter', 'tsp', 34),
  (null, 'Protein shake', 'scoop', 120),
  (null, 'Samosa', 'piece', 262),
  (null, 'Tea with milk', 'cup', 90),
  (null, 'Coffee with milk', 'cup', 60)
on conflict do nothing;
