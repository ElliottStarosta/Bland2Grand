"""
Standalone script to seed the Bland2Grand recipe database.

Slot mapping:
    1 = Cumin          5 = Oregano
    2 = Paprika        6 = Onion Powder
    3 = Garlic Powder  7 = Black Pepper
    4 = Chili Powder   8 = Cayenne

All gram values are per single serving.
Run from the bland2grand-backend directory:
    python seed_recipes.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from database import init_db, save_recipe, get_connection

# fmt: off
RECIPES = [
    # Mexican / Tex-Mex 
    {"name": "Tacos al Pastor",        "category": "Mexican",    "description": "Citrusy charred pork street tacos",
     "s": {1:2.0, 2:1.5, 3:0.8, 4:2.0, 5:0.5, 6:0.8, 7:0.3, 8:0.5}},

    {"name": "Chicken Fajitas",        "category": "Mexican",    "description": "Sizzling strip peppers and chicken",
     "s": {1:1.5, 2:1.0, 3:1.0, 4:1.5, 5:0.5, 6:1.0, 7:0.5, 8:0.2}},

    {"name": "Beef Tacos",             "category": "Mexican",    "description": "Classic seasoned ground beef tacos",
     "s": {1:2.0, 2:1.0, 3:0.8, 4:2.5, 5:0.5, 6:0.8, 7:0.3, 8:0.3}},

    {"name": "Enchiladas",             "category": "Mexican",    "description": "Red chile-smothered rolled tortillas",
     "s": {1:1.0, 2:2.0, 3:1.0, 4:2.0, 5:1.0, 6:0.5, 7:0.2, 8:0.5}},

    {"name": "Chili Con Carne",        "category": "Mexican",    "description": "Hearty beef and bean chili",
     "s": {1:3.0, 2:2.0, 3:1.5, 4:3.0, 5:1.0, 6:1.0, 7:0.5, 8:0.5}},

    {"name": "Burrito Bowl",           "category": "Mexican",    "description": "Chipotle-style seasoned rice and beans",
     "s": {1:1.5, 2:0.8, 3:0.8, 4:1.5, 5:0.5, 6:0.8, 7:0.3, 8:0.2}},

    {"name": "Carnitas",               "category": "Mexican",    "description": "Slow-cooked crispy pulled pork",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:1.0, 5:1.0, 6:1.0, 7:0.5, 8:0.2}},

    {"name": "Quesadillas",            "category": "Mexican",    "description": "Crispy cheesy folded tortillas",
     "s": {1:1.0, 2:0.8, 3:1.0, 4:1.0, 5:0.3, 6:0.8, 7:0.3, 8:0.1}},

    {"name": "Pozole",                 "category": "Mexican",    "description": "Hominy and pork chile stew",
     "s": {1:1.0, 2:1.5, 3:1.0, 4:2.0, 5:1.0, 6:1.0, 7:0.3, 8:0.3}},

    {"name": "Chorizo Spice",          "category": "Mexican",    "description": "Smoky paprika sausage blend",
     "s": {1:1.5, 2:3.0, 3:1.0, 4:1.0, 5:0.5, 6:0.5, 7:0.5, 8:1.0}},

    {"name": "Tamales",                "category": "Mexican",    "description": "Steamed masa with red chile pork",
     "s": {1:1.0, 2:1.0, 3:0.8, 4:1.5, 5:0.5, 6:0.5, 7:0.2, 8:0.3}},

    {"name": "Mole Negro Blend",       "category": "Mexican",    "description": "Complex dark chile-chocolate sauce base",
     "s": {1:1.5, 2:2.0, 3:1.0, 4:2.0, 5:0.5, 6:0.5, 7:0.5, 8:0.8}},

    {"name": "Huevos Rancheros",       "category": "Mexican",    "description": "Ranch-style eggs in tomato sauce",
     "s": {1:1.0, 2:0.5, 3:0.8, 4:1.0, 5:0.5, 6:0.8, 7:0.3, 8:0.3}},

    {"name": "Taco Seasoning",         "category": "Mexican",    "description": "All-purpose taco spice blend",
     "s": {1:2.5, 2:1.0, 3:0.8, 4:2.5, 5:0.5, 6:0.8, 7:0.3, 8:0.5}},

    # Indian / South Asian 
    {"name": "Chicken Tikka Masala",   "category": "Indian",     "description": "Creamy tomato-spiced chicken",
     "s": {1:2.0, 2:1.5, 3:1.5, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Butter Chicken",         "category": "Indian",     "description": "Mild creamy tomato-based curry",
     "s": {1:1.5, 2:2.0, 3:1.5, 4:0.3, 5:0.0, 6:0.5, 7:0.3, 8:0.3}},

    {"name": "Chicken Curry",          "category": "Indian",     "description": "Classic spiced yogurt chicken",
     "s": {1:2.0, 2:1.0, 3:1.0, 4:1.0, 5:0.0, 6:1.0, 7:0.5, 8:0.5}},

    {"name": "Dal Tadka",              "category": "Indian",     "description": "Yellow lentils with tempered spices",
     "s": {1:2.5, 2:0.5, 3:1.0, 4:0.5, 5:0.0, 6:0.5, 7:0.3, 8:0.3}},

    {"name": "Lamb Curry",             "category": "Indian",     "description": "Slow-braised lamb in rich masala",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:1.0, 5:0.0, 6:1.0, 7:0.5, 8:0.8}},

    {"name": "Biryani Spice",          "category": "Indian",     "description": "Fragrant basmati and meat layers",
     "s": {1:2.0, 2:1.0, 3:1.0, 4:0.5, 5:0.0, 6:0.5, 7:1.0, 8:0.3}},

    {"name": "Tandoori Blend",         "category": "Indian",     "description": "Smoky clay-oven marinade",
     "s": {1:1.5, 2:3.0, 3:1.5, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Chana Masala",           "category": "Indian",     "description": "Spiced chickpea stew",
     "s": {1:2.0, 2:1.0, 3:1.0, 4:1.0, 5:0.0, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Vindaloo",               "category": "Indian",     "description": "Fiery Goan pork curry",
     "s": {1:1.0, 2:2.0, 3:2.0, 4:2.0, 5:0.0, 6:0.5, 7:1.0, 8:2.0}},

    {"name": "Saag Paneer Spice",      "category": "Indian",     "description": "Spiced spinach with fresh cheese",
     "s": {1:1.5, 2:0.5, 3:1.0, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:0.3}},

    {"name": "Samosa Filling",         "category": "Indian",     "description": "Spiced potato and pea filling",
     "s": {1:2.0, 2:0.5, 3:0.8, 4:0.8, 5:0.0, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Aloo Gobi",              "category": "Indian",     "description": "Dry spiced potato and cauliflower",
     "s": {1:1.5, 2:0.5, 3:1.0, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:0.3}},

    # Italian 
    {"name": "Pasta Marinara",         "category": "Italian",    "description": "Simple san marzano tomato sauce",
     "s": {1:0.0, 2:0.5, 3:2.0, 4:0.0, 5:3.0, 6:1.5, 7:0.5, 8:0.0}},

    {"name": "Pizza Seasoning",        "category": "Italian",    "description": "Classic Neapolitan pizza blend",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:3.0, 6:0.5, 7:0.5, 8:0.1}},

    {"name": "Arrabbiata Sauce",       "category": "Italian",    "description": "Spicy angry sauce with chile heat",
     "s": {1:0.0, 2:0.5, 3:2.0, 4:0.0, 5:1.5, 6:1.0, 7:0.5, 8:1.5}},

    {"name": "Bolognese Spice",        "category": "Italian",    "description": "Slow-simmered meat sauce for tagliatelle",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:2.0, 6:1.5, 7:0.8, 8:0.0}},

    {"name": "Spaghetti Aglio e Olio", "category": "Italian",    "description": "Garlic and olive oil simplicity",
     "s": {1:0.0, 2:0.0, 3:3.0, 4:0.0, 5:0.5, 6:0.0, 7:0.5, 8:0.5}},

    {"name": "Italian Sausage Blend",  "category": "Italian",    "description": "Fennel-forward pork sausage seasoning",
     "s": {1:0.5, 2:2.0, 3:1.5, 4:0.0, 5:2.0, 6:1.0, 7:0.8, 8:0.3}},

    {"name": "Puttanesca Sauce",       "category": "Italian",    "description": "Bold olives, capers and anchovy sauce",
     "s": {1:0.0, 2:0.3, 3:2.0, 4:0.0, 5:1.5, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Chicken Cacciatore",     "category": "Italian",    "description": "Hunter-style braised chicken",
     "s": {1:0.0, 2:1.0, 3:1.5, 4:0.0, 5:2.0, 6:1.5, 7:0.8, 8:0.0}},

    {"name": "Bruschetta Topping",     "category": "Italian",    "description": "Herbed garlic tomato topping",
     "s": {1:0.0, 2:0.0, 3:1.5, 4:0.0, 5:1.5, 6:0.5, 7:0.5, 8:0.0}},

    {"name": "Osso Buco Spice",        "category": "Italian",    "description": "Braised veal shank seasoning",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:1.5, 6:1.5, 7:0.8, 8:0.0}},

    # BBQ & Cajun 
    {"name": "Classic BBQ Rub",        "category": "BBQ",        "description": "All-purpose smoky dry rub",
     "s": {1:1.0, 2:4.0, 3:1.5, 4:1.0, 5:0.5, 6:1.5, 7:0.8, 8:0.5}},

    {"name": "Cajun Blackening",       "category": "Cajun",      "description": "Bold cast-iron blackening blend",
     "s": {1:0.5, 2:3.0, 3:1.5, 4:1.0, 5:1.5, 6:1.5, 7:1.5, 8:1.5}},

    {"name": "Pulled Pork Rub",        "category": "BBQ",        "description": "Low-and-slow shoulder smoke rub",
     "s": {1:1.0, 2:3.0, 3:1.0, 4:1.0, 5:0.5, 6:1.5, 7:0.5, 8:0.3}},

    {"name": "Smoked Brisket Rub",     "category": "BBQ",        "description": "Texas-style pepper-forward brisket",
     "s": {1:1.0, 2:2.0, 3:1.5, 4:1.0, 5:0.5, 6:1.0, 7:1.5, 8:0.3}},

    {"name": "Jerk Chicken",           "category": "Caribbean",  "description": "Scotch bonnet and allspice marinade",
     "s": {1:0.5, 2:1.5, 3:1.0, 4:1.0, 5:1.0, 6:0.5, 7:1.0, 8:2.0}},

    {"name": "Gumbo Spice",            "category": "Cajun",      "description": "Creole holy trinity spice base",
     "s": {1:0.5, 2:2.0, 3:1.0, 4:1.0, 5:1.0, 6:1.5, 7:1.0, 8:0.8}},

    {"name": "Jambalaya Seasoning",    "category": "Cajun",      "description": "Rice, sausage, and shrimp Creole",
     "s": {1:0.5, 2:2.0, 3:1.5, 4:1.0, 5:1.0, 6:1.5, 7:1.0, 8:0.8}},

    {"name": "Memphis Dry Ribs",       "category": "BBQ",        "description": "Sweet paprika crust for pork ribs",
     "s": {1:0.5, 2:3.0, 3:1.0, 4:1.0, 5:0.3, 6:1.5, 7:0.5, 8:0.3}},

    {"name": "Kansas City Rub",        "category": "BBQ",        "description": "Molasses-sweet KC-style rub",
     "s": {1:1.0, 2:3.0, 3:1.0, 4:0.5, 5:0.5, 6:1.5, 7:0.5, 8:0.2}},

    {"name": "Blackened Chicken Wings","category": "Cajun",      "description": "Crispy spiced wings with heat",
     "s": {1:0.5, 2:2.0, 3:1.5, 4:1.0, 5:0.5, 6:1.0, 7:0.8, 8:1.0}},

    # Mediterranean & Middle Eastern 
    {"name": "Greek Seasoning",        "category": "Mediterranean","description": "Lemon-herb lamb and chicken blend",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:3.0, 6:1.0, 7:0.5, 8:0.0}},

    {"name": "Shawarma Spice",         "category": "Middle Eastern","description": "Warm rotating spit meat blend",
     "s": {1:2.5, 2:2.0, 3:1.5, 4:0.5, 5:0.5, 6:0.5, 7:0.5, 8:0.3}},

    {"name": "Falafel Blend",          "category": "Middle Eastern","description": "Herb-forward chickpea fritter mix",
     "s": {1:2.0, 2:0.5, 3:1.5, 4:0.3, 5:0.5, 6:0.5, 7:0.5, 8:0.2}},

    {"name": "Hummus Spice",           "category": "Middle Eastern","description": "Toasted tahini dip seasoning",
     "s": {1:1.5, 2:1.0, 3:1.0, 4:0.0, 5:0.0, 6:0.0, 7:0.3, 8:0.1}},

    {"name": "Mediterranean Chicken",  "category": "Mediterranean","description": "Herby baked chicken thighs",
     "s": {1:0.5, 2:1.0, 3:2.0, 4:0.0, 5:2.5, 6:1.0, 7:0.5, 8:0.0}},

    {"name": "Lamb Kofta",             "category": "Middle Eastern","description": "Spiced minced lamb skewers",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:0.5, 5:0.5, 6:1.5, 7:0.8, 8:0.3}},

    {"name": "Moroccan Chicken",       "category": "Moroccan",   "description": "Warm ras el hanout inspired blend",
     "s": {1:2.0, 2:2.0, 3:1.0, 4:0.5, 5:0.5, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Turkish Kebab",          "category": "Turkish",    "description": "Adana and shish kebab seasoning",
     "s": {1:1.5, 2:2.0, 3:1.5, 4:0.5, 5:0.5, 6:1.0, 7:0.8, 8:0.5}},

    {"name": "Shakshuka",              "category": "Middle Eastern","description": "Poached eggs in spiced tomato sauce",
     "s": {1:1.5, 2:2.0, 3:1.5, 4:0.5, 5:0.5, 6:0.5, 7:0.3, 8:0.5}},

    {"name": "Baharat Blend",          "category": "Middle Eastern","description": "Seven-spice all-purpose blend",
     "s": {1:2.0, 2:2.0, 3:0.0, 4:0.5, 5:0.5, 6:0.0, 7:1.0, 8:0.3}},

    {"name": "Za'atar Inspired",       "category": "Levantine",  "description": "Thyme-oregano sumac inspired blend",
     "s": {1:1.0, 2:0.5, 3:1.0, 4:0.0, 5:3.0, 6:0.0, 7:0.3, 8:0.0}},

    # American 
    {"name": "Fried Chicken",          "category": "American",   "description": "Southern crispy coating blend",
     "s": {1:0.5, 2:2.0, 3:1.5, 4:0.5, 5:0.5, 6:1.0, 7:1.0, 8:0.5}},

    {"name": "Cheeseburger Seasoning", "category": "American",   "description": "Classic beef patty blend",
     "s": {1:0.0, 2:0.5, 3:1.0, 4:0.0, 5:0.0, 6:1.5, 7:1.0, 8:0.0}},

    {"name": "Steak Rub",              "category": "American",   "description": "Bold dry rub for any cut",
     "s": {1:0.0, 2:1.0, 3:2.0, 4:0.0, 5:0.5, 6:1.0, 7:1.5, 8:0.2}},

    {"name": "Meatloaf Blend",         "category": "American",   "description": "Savory comfort meatloaf seasoning",
     "s": {1:0.0, 2:0.5, 3:1.0, 4:0.0, 5:0.5, 6:1.5, 7:0.8, 8:0.0}},

    {"name": "Roasted Vegetables",     "category": "American",   "description": "Herby sheet-pan vegetable blend",
     "s": {1:0.5, 2:1.0, 3:2.0, 4:0.0, 5:1.0, 6:1.0, 7:0.8, 8:0.0}},

    {"name": "Potato Wedges",          "category": "American",   "description": "Seasoned crispy oven wedges",
     "s": {1:0.5, 2:1.5, 3:1.5, 4:0.5, 5:0.5, 6:1.0, 7:0.5, 8:0.2}},

    {"name": "Beef Stew",              "category": "American",   "description": "Hearty winter stew seasoning",
     "s": {1:0.5, 2:0.5, 3:1.5, 4:0.0, 5:1.0, 6:1.5, 7:0.8, 8:0.0}},

    {"name": "Pot Roast",              "category": "American",   "description": "Sunday slow-braised chuck roast",
     "s": {1:0.0, 2:0.5, 3:2.0, 4:0.0, 5:0.8, 6:2.0, 7:1.0, 8:0.0}},

    {"name": "Sloppy Joe",             "category": "American",   "description": "Tangy sweet ground beef sandwich",
     "s": {1:0.5, 2:1.0, 3:1.0, 4:1.0, 5:0.3, 6:1.5, 7:0.5, 8:0.2}},

    {"name": "American Chili",         "category": "American",   "description": "Tex-Mex style bowl of red",
     "s": {1:3.0, 2:1.5, 3:1.0, 4:3.0, 5:0.5, 6:1.0, 7:0.5, 8:0.5}},

    # Seafood 
    {"name": "Blackened Fish",         "category": "Seafood",    "description": "Cajun cast-iron seared fish",
     "s": {1:0.5, 2:3.0, 3:1.5, 4:0.5, 5:1.0, 6:1.0, 7:1.5, 8:1.5}},

    {"name": "Cajun Shrimp",           "category": "Seafood",    "description": "Gulf coast buttered spiced shrimp",
     "s": {1:0.5, 2:2.5, 3:1.5, 4:0.5, 5:1.0, 6:1.0, 7:1.0, 8:1.0}},

    {"name": "Spiced Salmon",          "category": "Seafood",    "description": "Pan-seared paprika salmon fillet",
     "s": {1:1.0, 2:2.0, 3:1.0, 4:0.0, 5:0.5, 6:0.5, 7:0.8, 8:0.3}},

    {"name": "Fish Tacos",             "category": "Seafood",    "description": "Baja-style crispy fish seasoning",
     "s": {1:1.5, 2:1.0, 3:1.0, 4:1.0, 5:0.5, 6:0.5, 7:0.5, 8:0.3}},

    # Vegetarian / Vegan 
    {"name": "Roasted Cauliflower",    "category": "Vegetarian", "description": "Golden spiced cauliflower steaks",
     "s": {1:1.5, 2:2.0, 3:1.5, 4:0.5, 5:0.5, 6:0.5, 7:0.5, 8:0.3}},

    {"name": "Spiced Lentil Soup",     "category": "Vegetarian", "description": "Red lentil and tomato warming soup",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:0.5, 5:0.5, 6:1.0, 7:0.5, 8:0.3}},

    {"name": "Black Bean Soup",        "category": "Vegetarian", "description": "Latin-spiced smoky bean soup",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:1.0, 5:0.5, 6:1.0, 7:0.3, 8:0.2}},

    {"name": "Spiced Chickpeas",       "category": "Vegetarian", "description": "Crispy roasted snack chickpeas",
     "s": {1:2.0, 2:1.5, 3:1.0, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:0.5}},

    {"name": "Harissa Blend",          "category": "North African","description": "Fiery North African chile paste base",
     "s": {1:1.5, 2:3.0, 3:1.5, 4:1.5, 5:0.5, 6:0.0, 7:0.5, 8:2.0}},

    {"name": "Stuffed Bell Peppers",   "category": "Vegetarian", "description": "Herb and rice stuffed capsicum",
     "s": {1:1.0, 2:1.0, 3:1.5, 4:1.0, 5:1.0, 6:1.5, 7:0.5, 8:0.2}},

    {"name": "Vegetable Curry",        "category": "Vegetarian", "description": "Mixed vegetable coconut curry",
     "s": {1:2.0, 2:1.0, 3:1.0, 4:0.8, 5:0.0, 6:0.8, 7:0.5, 8:0.3}},

    {"name": "Veggie Burger Blend",    "category": "Vegetarian", "description": "Savory plant patty seasoning",
     "s": {1:1.0, 2:1.0, 3:1.5, 4:0.5, 5:0.5, 6:1.5, 7:0.8, 8:0.2}},

    # Latin American 
    {"name": "Adobo Seasoning",        "category": "Latin",      "description": "Puerto Rican all-purpose seasoning",
     "s": {1:1.5, 2:1.0, 3:2.0, 4:0.5, 5:1.5, 6:1.5, 7:0.8, 8:0.2}},

    {"name": "Pernil",                 "category": "Latin",      "description": "Puerto Rican slow-roasted pork",
     "s": {1:1.0, 2:1.0, 3:3.0, 4:0.5, 5:2.0, 6:1.5, 7:0.8, 8:0.2}},

    {"name": "Colombian Chicken",      "category": "Latin",      "description": "Pollo a la brasa style marinade",
     "s": {1:2.0, 2:1.0, 3:1.5, 4:0.5, 5:1.0, 6:1.0, 7:0.5, 8:0.2}},

    {"name": "Brazilian Churrasco",    "category": "Latin",      "description": "Herb-salted beef skewer rub",
     "s": {1:0.5, 2:1.0, 3:2.0, 4:0.0, 5:0.5, 6:0.5, 7:1.5, 8:0.2}},

    # Asian Fusion 
    {"name": "Korean BBQ Blend",       "category": "Asian",      "description": "Gochujang-inspired dry rub",
     "s": {1:0.5, 2:1.0, 3:2.0, 4:1.0, 5:0.0, 6:1.0, 7:0.8, 8:0.5}},

    {"name": "General Tso Chicken",    "category": "Asian",      "description": "Sweet heat takeaway classic",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.5, 5:0.0, 6:0.5, 7:0.5, 8:1.0}},

    {"name": "Dan Dan Noodles",        "category": "Asian",      "description": "Sichuan numbing peanut sauce spice",
     "s": {1:1.0, 2:0.5, 3:1.5, 4:1.5, 5:0.0, 6:0.5, 7:0.5, 8:1.0}},

    # Breakfast 
    {"name": "Breakfast Sausage",      "category": "Breakfast",  "description": "Sage-style morning pork sausage",
     "s": {1:0.0, 2:0.5, 3:0.8, 4:0.0, 5:0.5, 6:0.8, 7:1.5, 8:0.5}},

    {"name": "Spiced Hash Browns",     "category": "Breakfast",  "description": "Crispy seasoned potato cakes",
     "s": {1:0.5, 2:1.0, 3:1.0, 4:0.5, 5:0.5, 6:1.0, 7:0.5, 8:0.2}},

    # Holiday / Special 
    {"name": "Turkey Rub",             "category": "Holiday",    "description": "Thanksgiving herb-butter turkey",
     "s": {1:0.0, 2:1.0, 3:1.5, 4:0.0, 5:1.5, 6:1.0, 7:0.8, 8:0.0}},

    {"name": "Spiced Lamb Chops",      "category": "Holiday",    "description": "Elegant herb-crusted rack of lamb",
     "s": {1:1.5, 2:1.0, 3:2.0, 4:0.5, 5:1.0, 6:0.5, 7:1.0, 8:0.3}},

    {"name": "Harissa Chicken",        "category": "North African","description": "Fiery roasted North African chicken",
     "s": {1:1.5, 2:3.0, 3:1.5, 4:1.0, 5:0.5, 6:0.5, 7:0.5, 8:1.5}},

    {"name": "Spiced Rice Pilaf",      "category": "Middle Eastern","description": "Fragrant basmati side dish",
     "s": {1:1.5, 2:0.5, 3:1.0, 4:0.0, 5:0.5, 6:0.5, 7:0.3, 8:0.0}},

    {"name": "Shepherd's Pie",         "category": "British",    "description": "Ground lamb mince seasoning",
     "s": {1:0.0, 2:0.5, 3:1.0, 4:0.0, 5:1.0, 6:1.5, 7:0.8, 8:0.0}},

    {"name": "Pumpkin Soup",           "category": "American",   "description": "Warming autumn squash soup",
     "s": {1:1.0, 2:0.5, 3:1.0, 4:0.0, 5:0.0, 6:1.0, 7:0.5, 8:0.2}},

    {"name": "Tomato Bisque",          "category": "American",   "description": "Creamy roasted tomato soup",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:1.0, 6:1.0, 7:0.5, 8:0.0}},

    {"name": "Lemon Pepper Chicken",   "category": "American",   "description": "Zesty citrus-pepper roasted chicken",
     "s": {1:0.0, 2:0.5, 3:1.5, 4:0.0, 5:0.5, 6:1.0, 7:2.0, 8:0.0}},
]


# fmt: on


def _spice_kwargs(spice_map: dict) -> dict:
    """Map slot numbers to DB column keyword args."""
    cols = {
        1: "s1_cumin",
        2: "s2_paprika",
        3: "s3_garlic_powder",
        4: "s4_chili_powder",
        5: "s5_oregano",
        6: "s6_onion_powder",
        7: "s7_black_pepper",
        8: "s8_cayenne",
    }
    return {cols[slot]: grams for slot, grams in spice_map.items()}


def seed() -> int:
    init_db()
    conn = get_connection()
    cur = conn.cursor()
    count = 0

    print(f"Seeding {len(RECIPES)} recipes into the database…\n")

    for i, recipe in enumerate(RECIPES, start=1):
        spice_map = recipe["s"]
        try:
            cur.execute(
                """INSERT OR IGNORE INTO recipes
                   (name, category, description,
                    s1_cumin, s2_paprika, s3_garlic_powder, s4_chili_powder,
                    s5_oregano, s6_onion_powder, s7_black_pepper, s8_cayenne)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    recipe["name"],
                    recipe.get("category", "General"),
                    recipe.get("description", ""),
                    spice_map.get(1, 0),
                    spice_map.get(2, 0),
                    spice_map.get(3, 0),
                    spice_map.get(4, 0),
                    spice_map.get(5, 0),
                    spice_map.get(6, 0),
                    spice_map.get(7, 0),
                    spice_map.get(8, 0),
                ),
            )
            if cur.rowcount:
                count += 1
                print(f"  [{i:>3}/{len(RECIPES)}] {recipe['name']}")
            else:
                print(f"  [{i:>3}/{len(RECIPES)}] {recipe['name']}  (already exists)")
        except Exception as exc:
            print(f"  [{i:>3}/{len(RECIPES)}] ERROR -- {recipe['name']}: {exc}")

    conn.commit()
    conn.close()
    print(f"\nDone. {count} new recipes inserted.")
    return count


if __name__ == "__main__":
    seed()
