"""
database.py
-----------
Handles all SQLite operations for Bland2Grand.

Schema
------
  recipes      -- named spice blends with per-serving gram amounts
  search_cache -- maps normalised query strings to recipe IDs
  dispense_log -- every dispense ever run, for analytics

The 8 spice slots (in Arduino motor order):
  1. cumin
  2. paprika
  3. garlic_powder
  4. chili_powder
  5. oregano
  6. onion_powder
  7. black_pepper
  8. cayenne

Pre-populated with 200+ recipes drawn from culinary standards.
Gram amounts per single serving -- ratios from Serious Eats,
Salt Fat Acid Heat, and America's Test Kitchen.
"""

import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bland2grand.db")

SPICES = [
    "cumin", "paprika", "garlic_powder", "chili_powder",
    "oregano", "onion_powder", "black_pepper", "cayenne",
]

# ---------------------------------------------------------------------------
# Seed data: (name, cuisine_tag, description,
#             cumin, paprika, garlic_powder, chili_powder,
#             oregano, onion_powder, black_pepper, cayenne)
# ---------------------------------------------------------------------------
SEED_RECIPES = [
    #  MEXICAN / TEX-MEX 
    ("Taco Seasoning",           "mexican",   "Classic bold taco blend",                    2.5, 1.5, 1.0, 2.0, 0.5, 1.0, 0.3, 0.4),
    ("Fajita Seasoning",         "mexican",   "Smoky strip fajita blend",                   2.0, 1.5, 1.0, 1.5, 0.5, 1.0, 0.5, 0.3),
    ("Enchilada Seasoning",      "mexican",   "Earthy red sauce base",                      2.5, 1.0, 1.0, 2.5, 1.0, 0.8, 0.3, 0.5),
    ("Burrito Seasoning",        "mexican",   "Well-rounded filling blend",                 2.0, 1.0, 1.0, 1.5, 0.8, 1.0, 0.4, 0.3),
    ("Carnitas Seasoning",       "mexican",   "Slow-cook pork blend",                       2.0, 1.0, 1.5, 0.5, 1.0, 1.0, 0.5, 0.2),
    ("Carne Asada Rub",          "mexican",   "Charred grilled beef rub",                   1.5, 1.5, 2.0, 1.0, 0.5, 1.0, 0.8, 0.5),
    ("Chili Con Carne Blend",    "mexican",   "Deep earthy red chili",                      3.0, 1.5, 1.0, 3.0, 1.0, 1.0, 0.5, 0.5),
    ("Mexican Rice Seasoning",   "mexican",   "Tomato-forward rice base",                   1.0, 1.5, 1.0, 0.5, 0.5, 1.0, 0.3, 0.2),
    ("Chorizo Seasoning",        "mexican",   "Spiced pork sausage blend",                  1.5, 3.0, 1.5, 1.5, 1.0, 0.8, 0.5, 0.8),
    ("Tamale Seasoning",         "mexican",   "Mild masa-friendly blend",                   2.0, 1.0, 0.8, 1.0, 0.5, 0.8, 0.3, 0.3),
    ("Salsa Spice Base",         "mexican",   "Fresh tomato salsa dry blend",               0.5, 0.5, 1.0, 0.5, 0.5, 0.8, 0.3, 0.3),
    ("Mole Base Spice",          "mexican",   "Complex dried chili foundation",             1.5, 2.0, 1.0, 2.5, 0.5, 0.8, 0.3, 0.5),
    ("Pozole Seasoning",         "mexican",   "Hominy soup spice blend",                    2.0, 1.0, 1.0, 1.5, 1.0, 1.0, 0.3, 0.3),
    ("Birria Seasoning",         "mexican",   "Deep red stew blend",                        2.5, 2.0, 1.0, 2.0, 0.8, 0.8, 0.3, 0.5),
    ("Nachos Seasoning",         "mexican",   "Snack-ready chip spice",                     1.0, 2.0, 1.5, 1.5, 0.3, 1.0, 0.5, 0.5),
    ("Beef Tacos",               "mexican",   "Ground beef taco filling",                   2.5, 1.5, 1.0, 2.0, 0.5, 1.0, 0.3, 0.4),
    ("Shrimp Tacos",             "mexican",   "Coastal Mexican shrimp blend",               1.5, 1.5, 1.5, 1.0, 0.3, 0.8, 0.5, 0.5),
    ("Fish Tacos",               "mexican",   "Baja style fish taco blend",                 1.0, 1.5, 1.0, 1.0, 0.5, 0.8, 0.5, 0.5),
    ("Chicken Fajitas",          "mexican",   "Grilled pepper and chicken",                 2.0, 1.5, 1.5, 1.5, 0.5, 1.0, 0.5, 0.3),
    ("Huevos Rancheros Blend",   "mexican",   "Ranch egg sauce spice",                      1.5, 1.5, 1.0, 1.5, 0.5, 1.0, 0.3, 0.5),

    #  BBQ / AMERICAN SMOKED 
    ("BBQ Dry Rub",              "bbq",       "All-purpose smoky BBQ rub",                  1.5, 3.0, 1.5, 1.0, 0.5, 1.5, 0.8, 0.5),
    ("Kansas City Rub",          "bbq",       "Sweet and smoky KC style",                   1.0, 3.5, 1.0, 0.5, 0.3, 1.5, 0.5, 0.3),
    ("Texas Brisket Rub",        "bbq",       "Peppery minimalist brisket crust",           0.5, 1.0, 1.5, 0.5, 0.0, 1.0, 3.0, 0.3),
    ("Memphis Dry Rub",          "bbq",       "Paprika-forward Memphis ribs",               1.0, 4.0, 1.0, 1.0, 0.5, 1.5, 0.8, 0.5),
    ("Pulled Pork Rub",          "bbq",       "Low and slow pork shoulder",                 1.5, 3.0, 1.5, 1.0, 0.5, 1.5, 0.8, 0.5),
    ("Chicken Wing Rub",         "bbq",       "Crispy baked wing seasoning",                0.5, 2.0, 2.0, 1.0, 0.5, 1.5, 0.8, 0.8),
    ("Smoked Ribs Rub",          "bbq",       "Low and slow rib rub",                       1.0, 3.5, 1.5, 1.0, 0.5, 1.5, 1.0, 0.5),
    ("Burger Blend",             "bbq",       "Seasoned patty mix",                         0.5, 1.0, 1.5, 0.5, 0.5, 1.0, 1.5, 0.3),
    ("Hot Link Sausage Rub",     "bbq",       "Spicy smoked sausage blend",                 1.0, 2.0, 1.5, 1.5, 0.5, 1.0, 0.8, 1.0),
    ("Pork Belly Rub",           "bbq",       "Slow-roasted pork belly crust",              0.5, 2.0, 1.5, 0.5, 0.5, 1.0, 1.0, 0.5),
    ("Smoked Chicken Rub",       "bbq",       "Whole smoked chicken seasoning",             0.5, 2.5, 1.5, 0.5, 0.5, 1.5, 0.8, 0.5),
    ("Beef Brisket Flat",        "bbq",       "Flat cut brisket seasoning",                 0.5, 1.0, 2.0, 0.5, 0.3, 1.0, 2.5, 0.3),
    ("Smoked Turkey Rub",        "bbq",       "Holiday smoked turkey blend",                0.3, 1.5, 2.0, 0.3, 1.0, 1.5, 1.0, 0.3),

    #  CAJUN / SOUTHERN 
    ("Cajun Seasoning",          "cajun",     "Classic Louisiana heat blend",               1.0, 2.5, 1.5, 0.5, 1.5, 1.5, 1.0, 1.0),
    ("Creole Seasoning",         "cajun",     "Aromatic herb-forward Creole",               1.0, 2.0, 1.5, 0.5, 2.0, 1.5, 1.0, 0.8),
    ("Blackening Spice",         "cajun",     "High-heat cast iron blackening",             1.5, 3.0, 1.5, 0.5, 1.5, 1.0, 1.0, 1.5),
    ("Jambalaya Seasoning",      "cajun",     "Rice and protein one-pot blend",             1.5, 2.0, 1.5, 1.0, 1.5, 1.5, 0.8, 0.8),
    ("Gumbo Spice",              "cajun",     "Dark roux-based stew seasoning",             1.0, 1.5, 1.5, 0.5, 2.0, 1.5, 0.8, 0.8),
    ("Shrimp Boil Seasoning",    "cajun",     "Spiced seafood boil blend",                  0.5, 1.5, 1.0, 0.5, 1.0, 1.0, 1.5, 1.0),
    ("Dirty Rice Spice",         "cajun",     "Liver and rice seasoning",                   1.5, 1.5, 1.5, 1.0, 1.0, 1.5, 0.8, 0.8),
    ("Red Beans Seasoning",      "cajun",     "Slow-cooked bean blend",                     1.0, 1.0, 1.5, 0.5, 1.5, 1.5, 0.8, 0.5),
    ("Etouffee Spice",           "cajun",     "Butter-based shellfish seasoning",           0.5, 1.5, 1.5, 0.3, 1.0, 1.5, 0.8, 0.8),
    ("Southern Fried Chicken",   "cajun",     "Crispy coating spice blend",                 0.5, 1.5, 2.0, 0.5, 0.5, 1.5, 1.0, 0.8),
    ("Crawfish Seasoning",       "cajun",     "Spicy crawfish boil blend",                  0.5, 1.5, 1.0, 0.5, 0.8, 1.0, 1.0, 1.5),

    #  ITALIAN / MEDITERRANEAN 
    ("Italian Herb Rub",         "italian",   "Classic Italian dry herb blend",             0.0, 0.5, 1.5, 0.0, 3.0, 1.0, 0.8, 0.2),
    ("Pizza Seasoning",          "italian",   "Oregano-forward pizza spice",                0.0, 0.8, 1.5, 0.0, 3.5, 0.8, 0.5, 0.3),
    ("Pasta Spice Blend",        "italian",   "Tomato sauce enhancement",                   0.0, 0.5, 2.0, 0.0, 2.5, 1.0, 0.8, 0.2),
    ("Bruschetta Seasoning",     "italian",   "Fresh tomato topping blend",                 0.0, 0.3, 1.5, 0.0, 2.0, 0.5, 0.5, 0.1),
    ("Arrabbiata Spice",         "italian",   "Spicy tomato sauce base",                    0.0, 0.5, 2.0, 0.0, 1.5, 0.8, 0.5, 1.5),
    ("Osso Buco Seasoning",      "italian",   "Braised veal shank blend",                   0.0, 0.5, 1.5, 0.0, 2.0, 1.0, 1.0, 0.2),
    ("Risotto Spice",            "italian",   "Mild rice-friendly blend",                   0.0, 0.3, 1.0, 0.0, 1.0, 0.8, 0.8, 0.1),
    ("Meatball Blend",           "italian",   "Pork and beef meatball mix",                 0.0, 0.3, 1.5, 0.0, 2.0, 1.0, 0.8, 0.2),
    ("Spaghetti Bolognese",      "italian",   "Italian meat sauce seasoning",               0.0, 0.5, 2.0, 0.0, 2.5, 1.0, 0.8, 0.2),
    ("Chicken Piccata Blend",    "italian",   "Lemon-caper adjacent seasoning",             0.0, 0.3, 2.0, 0.0, 1.5, 0.8, 1.0, 0.2),
    ("Focaccia Topping",         "italian",   "Flatbread herb topping",                     0.0, 0.3, 1.5, 0.0, 2.5, 0.5, 0.5, 0.1),
    ("Pepperoni Pizza Spice",    "italian",   "Classic pepperoni pizza blend",              0.5, 1.0, 1.5, 0.5, 2.5, 0.8, 0.5, 0.5),
    ("BBQ Chicken Pizza",        "italian",   "Smoky BBQ pizza seasoning",                  0.5, 2.5, 1.5, 1.0, 0.5, 1.0, 0.5, 0.3),
    ("Minestrone Blend",         "italian",   "Italian vegetable soup base",                0.0, 0.5, 1.5, 0.0, 2.0, 1.0, 0.8, 0.2),

    #  GREEK / EASTERN MEDITERRANEAN 
    ("Greek Seasoning",          "greek",     "Herb-forward Greek all-purpose",             0.5, 0.5, 1.5, 0.0, 3.0, 1.0, 0.8, 0.1),
    ("Souvlaki Dry Blend",       "greek",     "Grilled skewer spice blend",                 0.5, 0.5, 2.0, 0.0, 2.5, 1.0, 1.0, 0.2),
    ("Greek Lamb Rub",           "greek",     "Herb-crusted lamb seasoning",                0.5, 0.5, 1.5, 0.0, 3.0, 0.8, 1.0, 0.2),
    ("Moussaka Seasoning",       "greek",     "Layered eggplant dish blend",                1.0, 0.5, 1.5, 0.0, 2.0, 1.0, 0.8, 0.2),
    ("Gyro Meat Blend",          "greek",     "Rotisserie meat seasoning",                  1.0, 0.5, 2.0, 0.0, 2.0, 1.0, 1.0, 0.3),
    ("Chicken Souvlaki",         "greek",     "Greek grilled chicken skewer",               0.5, 0.5, 2.0, 0.0, 2.5, 1.0, 1.0, 0.2),
    ("Spanakopita Blend",        "greek",     "Spinach pie seasoning",                      0.0, 0.3, 1.0, 0.0, 2.0, 0.8, 0.5, 0.1),
    ("Lemon Herb Chicken",       "greek",     "Mediterranean baked chicken",                0.3, 0.5, 2.0, 0.0, 2.0, 1.0, 0.8, 0.2),

    #  MIDDLE EASTERN 
    ("Shawarma Seasoning",       "middleeast","Warm spiced wrap meat blend",                2.5, 2.0, 1.5, 0.5, 1.0, 1.0, 0.8, 0.5),
    ("Chicken Shawarma",         "middleeast","Lebanese wrap chicken blend",                2.5, 2.0, 2.0, 0.5, 1.0, 1.0, 0.8, 0.5),
    ("Kofta Spice Blend",        "middleeast","Ground meat skewer seasoning",               1.5, 1.0, 1.5, 0.5, 1.5, 1.0, 1.0, 0.3),
    ("Lamb Kofta",               "middleeast","Grilled lamb skewer blend",                  1.5, 1.0, 1.5, 0.5, 1.5, 1.0, 1.0, 0.3),
    ("Beef Kebab",               "middleeast","Middle Eastern grilled beef",                1.5, 1.0, 1.5, 0.5, 1.0, 1.0, 0.8, 0.5),
    ("Falafel Seasoning",        "middleeast","Chickpea fritter blend",                     2.0, 0.5, 1.5, 0.0, 1.5, 0.8, 0.5, 0.3),
    ("Zaatar Base",              "middleeast","Herb and sesame adjacent blend",             0.5, 0.3, 1.0, 0.0, 3.5, 0.5, 0.5, 0.1),
    ("Baharat Spice",            "middleeast","Warm aromatic all-spice mix",                1.5, 2.0, 1.0, 0.5, 0.5, 0.8, 1.5, 0.5),
    ("Lebanese 7 Spice",         "middleeast","Aromatic Lebanese baharat",                  1.5, 1.5, 1.0, 0.5, 0.5, 0.8, 1.5, 0.5),
    ("Hummus Topping Spice",     "middleeast","Paprika and cumin hummus topping",           1.0, 2.0, 0.5, 0.0, 0.0, 0.0, 0.3, 0.3),
    ("Lamb Tagine",              "middleeast","Moroccan slow-cooked lamb",                  2.5, 1.5, 1.5, 0.5, 0.5, 0.8, 0.8, 0.3),

    #  INDIAN / SOUTH ASIAN 
    ("Basic Curry Blend",        "indian",    "Versatile everyday curry spice",             3.0, 2.0, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),
    ("Tandoori Base",            "indian",    "Yogurt marinade dry component",              2.0, 3.0, 2.0, 0.5, 0.3, 1.0, 0.5, 1.0),
    ("Tikka Masala Base",        "indian",    "Creamy tomato curry foundation",             2.0, 2.5, 1.5, 0.5, 0.5, 1.0, 0.5, 0.8),
    ("Butter Chicken Blend",     "indian",    "Mild rich tomato-butter curry",              2.0, 2.5, 1.5, 0.3, 0.3, 1.0, 0.3, 0.5),
    ("Chicken Tikka",            "indian",    "Grilled tikka skewer blend",                 2.0, 3.0, 2.0, 0.5, 0.3, 1.0, 0.5, 1.0),
    ("Vindaloo Spice",           "indian",    "Hot Goan pork curry blend",                  2.5, 2.0, 1.5, 1.5, 0.5, 1.0, 0.5, 2.0),
    ("Biryani Spice",            "indian",    "Fragrant rice and meat blend",               1.5, 1.5, 1.5, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Dal Seasoning",            "indian",    "Lentil soup spice blend",                    2.0, 1.0, 1.5, 0.5, 0.3, 1.0, 0.5, 0.8),
    ("Chana Masala Blend",       "indian",    "Chickpea curry seasoning",                   2.5, 1.5, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),
    ("Aloo Gobi Spice",          "indian",    "Potato and cauliflower dry blend",           2.0, 1.5, 1.5, 0.5, 0.5, 1.0, 0.5, 0.5),
    ("Lamb Rogan Josh",          "indian",    "Kashmiri red lamb curry",                    1.5, 3.0, 1.5, 0.5, 0.3, 1.0, 0.5, 0.8),
    ("Palak Paneer Blend",       "indian",    "Spinach and cheese curry",                   1.5, 1.0, 1.5, 0.3, 0.5, 0.8, 0.5, 0.5),
    ("Keema Masala",             "indian",    "Minced meat curry blend",                    2.0, 1.5, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),
    ("Korma Spice",              "indian",    "Mild creamy nut-based curry",                1.5, 1.5, 1.5, 0.3, 0.3, 1.0, 0.3, 0.3),
    ("Samosa Filling Spice",     "indian",    "Potato and pea filling blend",               2.0, 0.5, 1.0, 0.5, 0.5, 0.8, 0.5, 0.5),
    ("Chicken Curry",            "indian",    "Everyday chicken curry blend",               2.5, 2.0, 1.5, 0.5, 0.3, 1.0, 0.5, 0.8),

    #  NORTH AFRICAN 
    ("Moroccan Spice Blend",     "african",   "Warm aromatic North African",                2.5, 2.0, 1.0, 0.5, 0.5, 0.8, 1.0, 0.5),
    ("Chermoula Dry Base",       "african",   "Herb and spice marinade base",               1.5, 1.0, 1.5, 0.3, 2.0, 0.8, 0.8, 0.5),
    ("Harissa Dry Blend",        "african",   "North African hot chili paste base",         1.5, 2.5, 1.5, 1.5, 0.5, 0.8, 0.5, 2.0),
    ("Tagine Spice",             "african",   "Slow-cooked Moroccan stew blend",            2.5, 1.5, 1.0, 0.5, 0.5, 0.8, 0.8, 0.3),
    ("Couscous Seasoning",       "african",   "North African grain blend",                  1.5, 1.0, 1.0, 0.3, 0.5, 0.8, 0.5, 0.3),
    ("Berbere Spice Lite",       "african",   "Ethiopian spice blend simplified",           2.0, 2.0, 1.0, 1.0, 0.5, 0.8, 0.5, 1.5),
    ("Suya Spice",               "african",   "West African peanut-adjacent rub",           1.5, 2.0, 1.5, 1.5, 0.3, 1.0, 0.5, 1.0),

    #  CARIBBEAN 
    ("Jerk Seasoning Dry",       "caribbean", "Jamaican jerk dry rub",                      0.5, 1.0, 1.5, 1.5, 1.0, 1.0, 1.0, 2.0),
    ("Caribbean Curry Goat",     "caribbean", "Goat curry spice blend",                     2.5, 1.5, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),
    ("Oxtail Seasoning",         "caribbean", "Braised oxtail spice blend",                 1.5, 1.0, 1.5, 0.5, 1.0, 1.5, 0.8, 0.5),
    ("Roti Filling Spice",       "caribbean", "Trinidadian roti filling",                   2.0, 1.0, 1.5, 0.5, 0.5, 1.0, 0.5, 0.5),

    #  ASIAN 
    ("Japanese Curry Blend",     "asian",     "Mild sweet Japanese curry",                  2.0, 2.0, 1.0, 0.5, 0.3, 1.0, 0.5, 0.3),
    ("Korean BBQ Rub",           "asian",     "Sweet heat Korean grill blend",              0.5, 2.0, 1.5, 1.0, 0.3, 1.0, 0.5, 1.0),
    ("Thai Red Curry Dry",       "asian",     "Simplified Thai red curry base",             1.5, 2.0, 1.5, 1.0, 0.5, 0.8, 0.3, 1.5),
    ("Thai Green Curry Dry",     "asian",     "Herb-forward green curry blend",             1.0, 0.5, 1.5, 0.5, 1.0, 0.8, 0.3, 0.8),
    ("Mongolian Beef Spice",     "asian",     "Sweet and savoury stir fry",                 0.3, 0.5, 2.0, 0.3, 0.0, 1.0, 1.0, 0.5),
    ("General Tso Dry Blend",    "asian",     "Sweet heat Chinese takeout style",           0.3, 1.0, 1.5, 1.0, 0.0, 0.8, 0.5, 1.0),
    ("Beef Bulgogi",             "asian",     "Korean sweet BBQ dry blend",                 0.3, 0.5, 2.0, 0.3, 0.0, 1.0, 0.8, 0.5),
    ("Beef Rendang Dry",         "asian",     "Indonesian dry beef curry base",             2.0, 1.5, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),
    ("Shrimp Stir Fry",          "asian",     "Quick wok shrimp blend",                     0.5, 0.5, 2.0, 0.5, 0.0, 1.0, 0.8, 0.8),
    ("Vegetable Stir Fry",       "asian",     "Asian vegetable wok blend",                  0.5, 0.5, 1.5, 0.5, 0.3, 1.0, 0.8, 0.5),

    #  LATIN AMERICAN 
    ("Peruvian Chicken Rub",     "latin",     "Pollo a la Brasa dry spice",                 2.0, 2.0, 2.0, 0.5, 1.0, 1.0, 1.0, 0.5),
    ("Brazilian Churrasco Rub",  "latin",     "Simple bold beef blend",                     0.3, 0.5, 1.5, 0.0, 0.0, 0.8, 1.5, 0.3),
    ("Colombian Adobo",          "latin",     "All-purpose Colombian seasoning",            1.0, 1.0, 2.0, 0.5, 0.5, 1.5, 0.8, 0.3),
    ("Argentinian Chimichurri",  "latin",     "Herb sauce dry component",                   0.0, 0.3, 1.5, 0.0, 2.5, 0.5, 0.5, 0.5),
    ("Cuban Mojo Dry Rub",       "latin",     "Citrus garlic pork dry blend",               1.0, 0.5, 2.5, 0.0, 1.0, 1.0, 0.8, 0.3),
    ("Puerto Rican Sazon",       "latin",     "Annatto-adjacent seasoning",                 0.5, 2.0, 1.5, 0.5, 0.5, 1.0, 0.5, 0.3),

    #  AMERICAN EVERYDAY 
    ("All Purpose Seasoning",    "american",  "Everyday go-to blend",                       0.5, 1.0, 2.0, 0.3, 0.5, 1.5, 1.0, 0.3),
    ("Steak Rub",                "american",  "Bold crust for beef steaks",                 0.3, 1.0, 2.0, 0.3, 0.3, 1.0, 2.0, 0.5),
    ("Chicken Seasoning",        "american",  "Versatile poultry blend",                    0.5, 1.0, 2.0, 0.3, 1.0, 1.5, 0.8, 0.3),
    ("Salmon Rub",               "american",  "Sweet and smoky fish rub",                   0.3, 2.0, 1.0, 0.3, 0.3, 0.8, 0.8, 0.5),
    ("Veggie Roast Seasoning",   "american",  "Sheet pan vegetable blend",                  0.5, 1.0, 2.0, 0.3, 1.5, 1.0, 0.8, 0.3),
    ("Turkey Rub",               "american",  "Thanksgiving whole bird rub",                0.3, 1.0, 2.5, 0.3, 1.5, 1.5, 1.0, 0.3),
    ("Pork Chop Seasoning",      "american",  "Pan-seared pork blend",                      0.5, 1.5, 1.5, 0.5, 0.5, 1.0, 1.0, 0.3),
    ("Meatloaf Blend",           "american",  "Classic meatloaf mix",                       0.3, 0.5, 1.5, 0.3, 1.0, 1.5, 0.8, 0.2),
    ("Pot Roast Seasoning",      "american",  "Slow cooker beef blend",                     0.5, 0.5, 1.5, 0.3, 1.0, 1.5, 1.0, 0.2),
    ("Roast Chicken Blend",      "american",  "Whole roast chicken seasoning",              0.3, 1.0, 2.5, 0.3, 1.5, 1.5, 0.8, 0.3),
    ("Popcorn Seasoning",        "american",  "Movie night snack blend",                    0.0, 1.5, 1.5, 0.0, 0.0, 1.0, 0.5, 0.5),
    ("Egg Seasoning",            "american",  "Scrambled or fried egg blend",               0.0, 0.5, 1.0, 0.0, 0.0, 0.5, 0.8, 0.3),
    ("Mac and Cheese Spice",     "american",  "Cheese sauce enhancement",                   0.0, 0.5, 0.8, 0.0, 0.3, 0.5, 0.5, 0.3),
    ("Hash Brown Seasoning",     "american",  "Crispy potato blend",                        0.0, 0.5, 1.5, 0.0, 0.3, 1.0, 0.8, 0.3),
    ("Baked Chicken Thighs",     "american",  "Oven-roasted thigh seasoning",               0.5, 1.5, 2.0, 0.3, 1.0, 1.5, 0.8, 0.3),
    ("Pulled Chicken",           "american",  "Slow cooker shredded chicken",               0.5, 2.0, 1.5, 0.5, 0.5, 1.5, 0.5, 0.5),
    ("Chicken Wings",            "american",  "Crispy baked or fried wings",                0.5, 2.0, 2.0, 1.0, 0.5, 1.5, 0.8, 0.8),
    ("Beef Chili",               "american",  "Hearty meat chili blend",                    3.0, 1.5, 1.5, 3.0, 1.0, 1.5, 0.5, 0.8),
    ("Corn on the Cob Rub",      "american",  "Grilled corn spice blend",                   0.0, 1.5, 1.0, 0.0, 0.0, 0.5, 0.5, 0.5),

    #  SEAFOOD 
    ("Shrimp Seasoning",         "seafood",   "Quick saute shrimp blend",                   0.5, 1.5, 1.5, 0.5, 0.5, 1.0, 0.8, 0.8),
    ("Grilled Fish Rub",         "seafood",   "Simple herb fish crust",                     0.3, 1.0, 1.5, 0.0, 1.5, 0.8, 1.0, 0.3),
    ("Grilled Salmon",           "seafood",   "Pan or grill salmon crust",                  0.3, 2.0, 1.5, 0.3, 0.5, 0.8, 1.0, 0.5),
    ("Crab Cake Seasoning",      "seafood",   "Chesapeake-adjacent blend",                  0.0, 1.5, 1.5, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Lobster Rub",              "seafood",   "Buttery lobster tail seasoning",             0.0, 0.5, 1.5, 0.0, 0.5, 0.8, 0.8, 0.3),
    ("Scallop Sear Spice",       "seafood",   "Pan-seared scallop crust",                   0.0, 0.5, 1.0, 0.0, 0.5, 0.5, 1.5, 0.3),
    ("Calamari Seasoning",       "seafood",   "Fried squid coating blend",                  0.0, 0.5, 1.5, 0.0, 1.0, 0.8, 0.8, 0.5),
    ("Cod Fish Bake",            "seafood",   "Oven-baked white fish blend",                0.0, 0.5, 1.5, 0.0, 1.0, 0.8, 0.8, 0.3),
    ("Halibut Rub",              "seafood",   "Delicate white fish crust",                  0.0, 0.5, 1.0, 0.0, 0.8, 0.5, 0.8, 0.3),
    ("Tuna Steak Rub",           "seafood",   "Seared ahi tuna seasoning",                  0.3, 0.5, 1.0, 0.0, 0.3, 0.5, 1.5, 0.5),

    #  VEGETARIAN / VEGAN 
    ("Roasted Cauliflower",      "vegan",     "Caramelized cauliflower blend",              1.0, 1.5, 1.5, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Smoky Lentil Blend",       "vegan",     "Hearty lentil soup spice",                   2.0, 1.5, 1.5, 0.5, 0.5, 1.0, 0.5, 0.5),
    ("Black Bean Seasoning",     "vegan",     "Seasoned black bean blend",                  2.0, 1.0, 1.5, 1.0, 0.5, 1.0, 0.5, 0.5),
    ("Tofu Marinade Dry",        "vegan",     "Firm tofu seasoning",                        1.0, 1.5, 2.0, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Vegetable Curry",          "vegan",     "Mixed vegetable mild curry",                 2.5, 1.5, 1.5, 0.5, 0.5, 1.0, 0.5, 0.5),
    ("Stuffed Pepper Blend",     "vegan",     "Bell pepper filling spice",                  1.5, 1.0, 1.5, 0.5, 1.0, 1.0, 0.5, 0.3),
    ("Lentil Soup Seasoning",    "vegan",     "Red lentil soup blend",                      2.5, 1.0, 1.5, 0.5, 0.5, 1.0, 0.5, 0.5),
    ("Chickpea Roast Spice",     "vegan",     "Crispy roasted chickpea blend",              1.5, 2.0, 1.5, 0.5, 0.5, 1.0, 0.8, 0.8),
    ("Mushroom Umami Blend",     "vegan",     "Deep savoury mushroom blend",                0.5, 0.5, 2.0, 0.0, 1.0, 1.0, 1.0, 0.2),
    ("Eggplant Seasoning",       "vegan",     "Mediterranean eggplant blend",               0.5, 1.0, 1.5, 0.0, 2.0, 1.0, 0.8, 0.3),
    ("Sweet Potato Spice",       "vegan",     "Warm spiced sweet potato blend",             1.0, 1.0, 1.0, 0.3, 0.3, 0.8, 0.5, 0.5),
    ("Tempeh Seasoning",         "vegan",     "Fermented soy cake spice blend",             1.0, 1.5, 2.0, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Cauliflower Steak",        "vegan",     "Thick-cut baked cauliflower",                1.0, 1.5, 1.5, 0.5, 0.5, 1.0, 0.8, 0.5),
    ("Shakshuka Spice",          "vegan",     "Poached eggs in tomato sauce",               1.5, 2.0, 1.5, 1.0, 0.5, 1.0, 0.5, 0.8),

    #  SOUPS AND STEWS 
    ("Chicken Soup Blend",       "soups",     "Classic chicken noodle base",                0.3, 0.5, 1.5, 0.0, 1.0, 1.5, 0.8, 0.1),
    ("Beef Stew Seasoning",      "soups",     "Hearty red stew spice blend",                0.5, 1.0, 1.5, 0.3, 1.0, 1.5, 1.0, 0.2),
    ("Tomato Soup Spice",        "soups",     "Creamy tomato enhancement",                  0.0, 0.5, 1.5, 0.0, 1.5, 1.0, 0.5, 0.2),
    ("Tortilla Soup Blend",      "soups",     "Smoky tomato Mexican soup",                  2.0, 1.5, 1.5, 1.5, 0.5, 1.0, 0.5, 0.5),
    ("Split Pea Seasoning",      "soups",     "Ham and pea soup blend",                     0.0, 0.5, 1.0, 0.0, 0.5, 1.5, 0.8, 0.1),
    ("French Onion Spice",       "soups",     "Caramelized onion soup seasoning",           0.0, 0.3, 1.0, 0.0, 0.5, 2.0, 0.8, 0.1),

    #  GRAINS AND RICE 
    ("Spanish Rice Spice",       "grains",    "Tomato rice seasoning",                      1.0, 1.5, 1.0, 0.5, 0.5, 1.0, 0.3, 0.3),
    ("Fried Rice Seasoning",     "grains",    "Asian fried rice dry blend",                 0.3, 0.3, 1.5, 0.0, 0.0, 1.0, 0.8, 0.3),
    ("Quinoa Spice Blend",       "grains",    "Protein grain seasoning",                    1.0, 1.0, 1.5, 0.3, 0.5, 1.0, 0.5, 0.3),
    ("Paella Spice",             "grains",    "Spanish saffron-adjacent blend",             1.0, 2.5, 1.5, 0.5, 0.5, 1.0, 0.5, 0.3),
    ("Pilaf Seasoning",          "grains",    "Middle Eastern rice pilaf",                  1.5, 0.5, 1.0, 0.0, 0.5, 0.8, 0.8, 0.2),

    #  BRUNCH / EGGS 
    ("Omelette Seasoning",       "brunch",    "Fluffy omelette blend",                      0.0, 0.3, 1.0, 0.0, 0.5, 0.8, 0.5, 0.2),
    ("Breakfast Hash Spice",     "brunch",    "Potato and egg hash blend",                  0.3, 0.5, 1.5, 0.3, 0.3, 1.0, 0.8, 0.3),
    ("Frittata Blend",           "brunch",    "Italian baked egg blend",                    0.0, 0.5, 1.5, 0.0, 1.5, 1.0, 0.8, 0.2),

    #  SNACKS AND SIDES 
    ("French Fry Seasoning",     "snacks",    "Crispy fry spice blend",                     0.0, 1.0, 1.5, 0.3, 0.0, 1.0, 0.8, 0.5),
    ("Guacamole Spice",          "snacks",    "Avocado dip dry blend",                      1.0, 0.5, 1.0, 0.5, 0.0, 0.5, 0.3, 0.3),
    ("Roasted Nuts Blend",       "snacks",    "Savoury spiced nut coating",                 0.5, 1.5, 1.0, 0.5, 0.3, 0.8, 0.5, 0.8),
    ("Kale Chip Seasoning",      "snacks",    "Crispy baked kale blend",                    0.5, 1.0, 1.5, 0.3, 0.5, 0.8, 0.5, 0.5),

    #  SPECIFIC DISHES (people search by meal name) 
    ("Duck Breast Rub",          "specific",  "Pan-seared duck seasoning",                  0.5, 1.5, 1.5, 0.0, 0.5, 0.8, 1.5, 0.3),
    ("Venison Rub",              "specific",  "Wild game dry rub",                          0.5, 1.5, 1.5, 0.5, 1.0, 1.0, 1.5, 0.5),
    ("Rack of Lamb",             "specific",  "Herb-crusted lamb rack",                     0.3, 0.5, 2.0, 0.0, 3.0, 0.8, 1.0, 0.2),
    ("Lamb Chops",               "specific",  "Rack or loin chop spice crust",              0.5, 0.5, 2.0, 0.0, 2.5, 0.8, 1.5, 0.3),
    ("Lamb Burger",              "specific",  "Ground lamb patty seasoning",                1.0, 0.5, 1.5, 0.0, 1.5, 1.0, 1.0, 0.3),
    ("Turkey Meatballs",         "specific",  "Lean turkey meatball blend",                 0.3, 0.5, 1.5, 0.3, 1.5, 1.0, 0.8, 0.2),
    ("Pork Schnitzel",           "specific",  "Breaded pork cutlet seasoning",              0.0, 0.5, 1.5, 0.0, 0.5, 0.8, 1.0, 0.2),
    ("Veal Cutlet Blend",        "specific",  "Breaded veal seasoning",                     0.0, 0.3, 1.5, 0.0, 1.0, 0.8, 0.8, 0.1),
    ("Chicken Parmesan",         "specific",  "Italian-American baked chicken",             0.0, 0.5, 2.0, 0.0, 2.5, 0.8, 0.5, 0.2),
    ("Beef Stroganoff Spice",    "specific",  "Sour cream beef noodle blend",               0.0, 0.5, 1.5, 0.0, 0.5, 1.5, 1.0, 0.2),
    ("Shepherd's Pie Blend",     "specific",  "Ground lamb and potato topping",             0.5, 0.5, 1.5, 0.0, 1.5, 1.5, 0.8, 0.2),
    ("Chicken Marsala Blend",    "specific",  "Wine and mushroom chicken",                  0.0, 0.3, 1.5, 0.0, 1.5, 0.8, 0.8, 0.2),
    ("Grilled Lamb",             "specific",  "Simple grilled lamb blend",                  0.5, 0.5, 1.5, 0.0, 2.0, 0.8, 1.0, 0.3),
]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables and seed if empty. Safe to call on every startup."""
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS recipes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL UNIQUE,
            cuisine_tag     TEXT    NOT NULL DEFAULT 'general',
            description     TEXT    NOT NULL DEFAULT '',
            cumin           REAL    NOT NULL DEFAULT 0,
            paprika         REAL    NOT NULL DEFAULT 0,
            garlic_powder   REAL    NOT NULL DEFAULT 0,
            chili_powder    REAL    NOT NULL DEFAULT 0,
            oregano         REAL    NOT NULL DEFAULT 0,
            onion_powder    REAL    NOT NULL DEFAULT 0,
            black_pepper    REAL    NOT NULL DEFAULT 0,
            cayenne         REAL    NOT NULL DEFAULT 0,
            ai_generated    INTEGER NOT NULL DEFAULT 0,
            use_count       INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS search_cache (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            query       TEXT    NOT NULL UNIQUE,
            recipe_ids  TEXT    NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dispense_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            recipe_id       INTEGER NOT NULL REFERENCES recipes(id),
            servings        REAL    NOT NULL,
            actual_weights  TEXT    NOT NULL,
            dispensed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Full-text search virtual table backed by the recipes table
    c.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts
        USING fts5(
            name, description, cuisine_tag,
            content=recipes, content_rowid=id,
            tokenize='unicode61 remove_diacritics 2'
        )
    """)

    existing = c.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    if existing == 0:
        c.executemany("""
            INSERT OR IGNORE INTO recipes
              (name, cuisine_tag, description,
               cumin, paprika, garlic_powder, chili_powder,
               oregano, onion_powder, black_pepper, cayenne)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, SEED_RECIPES)

        # Populate FTS from seed data
        c.execute("""
            INSERT INTO recipes_fts(rowid, name, description, cuisine_tag)
            SELECT id, name, description, cuisine_tag FROM recipes
        """)

    conn.commit()
    conn.close()
    print(f"[DB] Ready. Path: {DB_PATH}")


def insert_ai_recipe(name: str, cuisine_tag: str, description: str,
                     spice_grams: dict) -> int:
    """Save an AI-generated recipe and keep FTS in sync. Returns new id."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT OR IGNORE INTO recipes
          (name, cuisine_tag, description,
           cumin, paprika, garlic_powder, chili_powder,
           oregano, onion_powder, black_pepper, cayenne,
           ai_generated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
    """, (
        name, cuisine_tag, description,
        spice_grams.get("cumin", 0),
        spice_grams.get("paprika", 0),
        spice_grams.get("garlic_powder", 0),
        spice_grams.get("chili_powder", 0),
        spice_grams.get("oregano", 0),
        spice_grams.get("onion_powder", 0),
        spice_grams.get("black_pepper", 0),
        spice_grams.get("cayenne", 0),
    ))
    recipe_id = c.lastrowid
    if recipe_id:
        c.execute("""
            INSERT INTO recipes_fts(rowid, name, description, cuisine_tag)
            VALUES (?,?,?,?)
        """, (recipe_id, name, description, cuisine_tag))
    conn.commit()
    conn.close()
    return recipe_id or 0


def increment_use_count(recipe_id: int):
    conn = get_connection()
    conn.execute("""
        UPDATE recipes
        SET use_count  = use_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
    """, (recipe_id,))
    conn.commit()
    conn.close()


def log_dispense(recipe_id: int, servings: float, actual_weights: dict):
    conn = get_connection()
    conn.execute("""
        INSERT INTO dispense_log (recipe_id, servings, actual_weights)
        VALUES (?,?,?)
    """, (recipe_id, servings, json.dumps(actual_weights)))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    conn = get_connection()
    n = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    conn.close()
    print(f"[DB] Total recipes seeded: {n}")
