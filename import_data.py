import pandas as pd
from sqlalchemy import create_engine

# Connexion à phpMyAdmin
engine = create_engine('mysql+pymysql://root:@localhost/users_db') 

file_path = "hotels_combine.xlsx"

try:
    df = pd.read_excel(file_path, sheet_name='Feuil2', engine='openpyxl')

    # 2. Nettoyage : Supprimer les lignes qui sont totalement vides
    df = df.dropna(how='all')

    # 3. Sélectionner les 4 premières colonnes (Hôtel, Étoiles, Description, Ville)
    df = df.iloc[:, 0:4]
    df.columns = ['hotel_name', 'stars', 'description', 'city']

    # 4. Supprimer les lignes où le nom de l'hôtel est vide
    # Cela permet d'éliminer les faux enregistrements
    df = df.dropna(subset=['hotel_name'])

    # 5. Afficher le nombre d'hôtels trouvés pour vérifier
    print(f"Nombre d'hôtels détectés dans le fichier : {len(df)}")

    # 6. Envoyer vers MySQL (écrase l'ancienne table de 28 lignes)
    df.to_sql('hotels', con=engine, if_exists='replace', index=False)

    print("✅ Succès ! La base de données contient maintenant la liste complète.")

except Exception as e:
    print(f"❌ Erreur lors de l'import : {e}")