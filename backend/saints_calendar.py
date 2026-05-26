"""
Calendario santi e celebrazioni principali.
Solennità, feste e memorie fisse (non mobili).
Per memorie mobili legate alla Pasqua bisognerebbe calcolare la data della Pasqua.
"""

# Formato: "MM-DD": [{title, rank, color, type}]
# rank: solennita, festa, memoria_obbligatoria, memoria_facoltativa
SAINTS_CALENDAR = {
    "01-01": [{"title": "Maria Santissima Madre di Dio", "rank": "solennita", "color": "bianco"}],
    "01-06": [{"title": "Epifania del Signore", "rank": "solennita", "color": "bianco"}],
    "01-17": [{"title": "Sant'Antonio abate", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "01-20": [{"title": "San Sebastiano, martire", "rank": "memoria_facoltativa", "color": "rosso"}],
    "01-21": [{"title": "Sant'Agnese, vergine e martire", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "01-25": [{"title": "Conversione di San Paolo apostolo", "rank": "festa", "color": "bianco"}],
    "01-28": [{"title": "San Tommaso d'Aquino, sacerdote e dottore della Chiesa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "01-31": [{"title": "San Giovanni Bosco, sacerdote", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "02-02": [{"title": "Presentazione del Signore", "rank": "festa", "color": "bianco"}],
    "02-05": [{"title": "Sant'Agata, vergine e martire", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "02-10": [{"title": "Santa Scolastica, vergine", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "02-11": [{"title": "Beata Vergine Maria di Lourdes", "rank": "memoria_facoltativa", "color": "bianco"}],
    "02-14": [{"title": "Santi Cirillo e Metodio, patroni d'Europa", "rank": "festa", "color": "bianco"}],
    "02-22": [{"title": "Cattedra di San Pietro apostolo", "rank": "festa", "color": "bianco"}],
    "03-19": [{"title": "San Giuseppe, sposo della Beata Vergine Maria", "rank": "solennita", "color": "bianco"}],
    "03-25": [{"title": "Annunciazione del Signore", "rank": "solennita", "color": "bianco"}],
    "04-25": [{"title": "San Marco, evangelista", "rank": "festa", "color": "rosso"}],
    "04-29": [{"title": "Santa Caterina da Siena, patrona d'Italia e d'Europa", "rank": "festa", "color": "bianco"}],
    "05-01": [{"title": "San Giuseppe lavoratore", "rank": "memoria_facoltativa", "color": "bianco"}],
    "05-03": [{"title": "Santi Filippo e Giacomo, apostoli", "rank": "festa", "color": "rosso"}],
    "05-13": [{"title": "Beata Vergine Maria di Fatima", "rank": "memoria_facoltativa", "color": "bianco"}],
    "05-14": [{"title": "San Mattia, apostolo", "rank": "festa", "color": "rosso"}],
    "05-31": [{"title": "Visitazione della Beata Vergine Maria", "rank": "festa", "color": "bianco"}],
    "06-13": [{"title": "Sant'Antonio di Padova, sacerdote e dottore della Chiesa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "06-21": [{"title": "San Luigi Gonzaga, religioso", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "06-24": [{"title": "Natività di San Giovanni Battista", "rank": "solennita", "color": "bianco"}],
    "06-29": [{"title": "Santi Pietro e Paolo, apostoli", "rank": "solennita", "color": "rosso"}],
    "07-03": [{"title": "San Tommaso, apostolo", "rank": "festa", "color": "rosso"}],
    "07-11": [{"title": "San Benedetto, abate, patrono d'Europa", "rank": "festa", "color": "bianco"}],
    "07-22": [{"title": "Santa Maria Maddalena", "rank": "festa", "color": "bianco"}],
    "07-23": [{"title": "Santa Brigida, patrona d'Europa", "rank": "festa", "color": "bianco"}],
    "07-25": [{"title": "San Giacomo, apostolo", "rank": "festa", "color": "rosso"}],
    "07-26": [{"title": "Santi Gioacchino e Anna, genitori della Beata Vergine Maria", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "07-29": [{"title": "Santi Marta, Maria e Lazzaro", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "08-06": [{"title": "Trasfigurazione del Signore", "rank": "festa", "color": "bianco"}],
    "08-08": [{"title": "San Domenico, sacerdote", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "08-10": [{"title": "San Lorenzo, diacono e martire", "rank": "festa", "color": "rosso"}],
    "08-11": [{"title": "Santa Chiara, vergine", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "08-14": [{"title": "San Massimiliano Maria Kolbe, sacerdote e martire", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "08-15": [{"title": "Assunzione della Beata Vergine Maria", "rank": "solennita", "color": "bianco"}],
    "08-24": [{"title": "San Bartolomeo, apostolo", "rank": "festa", "color": "rosso"}],
    "08-27": [{"title": "Santa Monica", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "08-28": [{"title": "Sant'Agostino, vescovo e dottore della Chiesa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "08-29": [{"title": "Martirio di San Giovanni Battista", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "09-08": [{"title": "Natività della Beata Vergine Maria", "rank": "festa", "color": "bianco"}],
    "09-14": [{"title": "Esaltazione della Santa Croce", "rank": "festa", "color": "rosso"}],
    "09-15": [{"title": "Beata Vergine Maria Addolorata", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "09-21": [{"title": "San Matteo, apostolo ed evangelista", "rank": "festa", "color": "rosso"}],
    "09-23": [{"title": "San Pio da Pietrelcina, sacerdote", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "09-29": [{"title": "Santi Arcangeli Michele, Gabriele e Raffaele", "rank": "festa", "color": "bianco"}],
    "10-02": [{"title": "Santi Angeli Custodi", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "10-04": [{"title": "San Francesco d'Assisi, patrono d'Italia", "rank": "festa", "color": "bianco"}],
    "10-07": [{"title": "Beata Vergine Maria del Rosario", "rank": "memoria_obbligatoria", "color": "bianco"}],`n    "10-11": [{"title": "San Giovanni XXIII, papa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "10-15": [{"title": "Santa Teresa di Gesù, vergine e dottore della Chiesa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "10-18": [{"title": "San Luca, evangelista", "rank": "festa", "color": "rosso"}],`n    "10-22": [{"title": "San Giovanni Paolo II, papa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "10-28": [{"title": "Santi Simone e Giuda, apostoli", "rank": "festa", "color": "rosso"}],
    "11-01": [{"title": "Tutti i Santi", "rank": "solennita", "color": "bianco"}],
    "11-02": [{"title": "Commemorazione di tutti i fedeli defunti", "rank": "solennita", "color": "viola"}],
    "11-09": [{"title": "Dedicazione della Basilica Lateranense", "rank": "festa", "color": "bianco"}],
    "11-11": [{"title": "San Martino di Tours, vescovo", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "11-21": [{"title": "Presentazione della Beata Vergine Maria", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "11-22": [{"title": "Santa Cecilia, vergine e martire", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "11-30": [{"title": "Sant'Andrea, apostolo", "rank": "festa", "color": "rosso"}],
    "12-03": [{"title": "San Francesco Saverio, sacerdote", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "12-07": [{"title": "Sant'Ambrogio, vescovo e dottore della Chiesa", "rank": "memoria_obbligatoria", "color": "bianco"}],
    "12-08": [{"title": "Immacolata Concezione della Beata Vergine Maria", "rank": "solennita", "color": "bianco"}],
    "12-12": [{"title": "Beata Vergine Maria di Guadalupe", "rank": "memoria_facoltativa", "color": "bianco"}],
    "12-13": [{"title": "Santa Lucia, vergine e martire", "rank": "memoria_obbligatoria", "color": "rosso"}],
    "12-25": [{"title": "Natività del Signore", "rank": "solennita", "color": "bianco"}],
    "12-26": [{"title": "Santo Stefano, primo martire", "rank": "festa", "color": "rosso"}],
    "12-27": [{"title": "San Giovanni, apostolo ed evangelista", "rank": "festa", "color": "bianco"}],
    "12-28": [{"title": "Santi Innocenti, martiri", "rank": "festa", "color": "rosso"}],
}


# Messe votive disponibili
VOTIVE_MASSES = [
    {"id": "ss_trinita", "title": "Santissima Trinità", "color": "bianco"},
    {"id": "spirito_santo", "title": "Dello Spirito Santo", "color": "rosso"},
    {"id": "ss_sacramento", "title": "Del Santissimo Sacramento", "color": "bianco"},
    {"id": "ss_nome_gesu", "title": "Del Santissimo Nome di Gesù", "color": "bianco"},
    {"id": "preziosissimo_sangue", "title": "Del Preziosissimo Sangue di Cristo", "color": "rosso"},
    {"id": "sacro_cuore", "title": "Del Sacro Cuore di Gesù", "color": "bianco"},
    {"id": "bvm", "title": "Della Beata Vergine Maria", "color": "bianco"},
    {"id": "angeli", "title": "Degli Angeli", "color": "bianco"},
    {"id": "ss_apostoli", "title": "Dei Santi Apostoli Pietro e Paolo", "color": "rosso"},
    {"id": "tutti_santi", "title": "Di Tutti i Santi", "color": "bianco"},
    {"id": "defunti", "title": "Per i fedeli defunti", "color": "viola"},
    {"id": "sposi", "title": "Per gli sposi", "color": "bianco"},
    {"id": "malati", "title": "Per gli infermi", "color": "viola"},
    {"id": "pace", "title": "Per la pace e la giustizia", "color": "viola"},
]


def get_saints_for_date(target_date) -> list:
    """Ritorna le celebrazioni del calendario santi per una data."""
    key = f"{target_date.month:02d}-{target_date.day:02d}"
    return SAINTS_CALENDAR.get(key, [])
