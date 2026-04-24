"""
Testi liturgici dell'Ordinario della Messa.
Nota: Questi sono i testi tradizionali in uso nella Chiesa Cattolica Italiana.
Per uso pastorale - si raccomanda confronto con edizione CEI ufficiale del Messale Romano.
"""

MASS_ORDER = [
    {"id": "riti_iniziali", "title": "Riti di Introduzione"},
    {"id": "atto_penitenziale", "title": "Atto Penitenziale"},
    {"id": "gloria", "title": "Gloria"},
    {"id": "colletta", "title": "Colletta (Orazione del giorno)"},
    {"id": "liturgia_parola", "title": "Liturgia della Parola"},
    {"id": "credo", "title": "Professione di Fede (Credo)"},
    {"id": "preghiera_fedeli", "title": "Preghiera dei Fedeli"},
    {"id": "offertorio", "title": "Liturgia Eucaristica - Offertorio"},
    {"id": "preghiera_eucaristica", "title": "Preghiera Eucaristica"},
    {"id": "padre_nostro", "title": "Riti di Comunione - Padre Nostro"},
    {"id": "comunione", "title": "Frazione del Pane e Comunione"},
    {"id": "riti_conclusione", "title": "Riti di Conclusione"},
]

FIXED_PARTS = {
    "riti_iniziali": {
        "title": "Riti di Introduzione",
        "sections": [
            {
                "type": "rubric",
                "text": "Il sacerdote, giunto all'altare, lo venera con un bacio e si reca alla sede. Fatto il segno della croce, saluta il popolo."
            },
            {
                "type": "dialogue",
                "celebrante": "Nel nome del Padre e del Figlio e dello Spirito Santo.",
                "assemblea": "Amen."
            },
            {
                "type": "choice",
                "label": "Saluto",
                "options": [
                    {
                        "id": "A",
                        "celebrante": "La grazia del Signore nostro Gesù Cristo, l'amore di Dio Padre e la comunione dello Spirito Santo siano con tutti voi.",
                        "assemblea": "E con il tuo spirito."
                    },
                    {
                        "id": "B",
                        "celebrante": "La grazia e la pace di Dio nostro Padre e del Signore nostro Gesù Cristo siano con tutti voi.",
                        "assemblea": "E con il tuo spirito."
                    },
                    {
                        "id": "C",
                        "celebrante": "Il Signore sia con voi.",
                        "assemblea": "E con il tuo spirito."
                    }
                ]
            }
        ]
    },
    "atto_penitenziale": {
        "title": "Atto Penitenziale",
        "sections": [
            {
                "type": "rubric",
                "text": "Il sacerdote invita i fedeli all'atto penitenziale:"
            },
            {
                "type": "monologue",
                "celebrante": "Fratelli e sorelle, per celebrare degnamente i santi misteri, riconosciamo i nostri peccati."
            },
            {
                "type": "choice",
                "label": "Formula",
                "options": [
                    {
                        "id": "A",
                        "label": "Formula A - Confesso",
                        "assemblea": "Confesso a Dio onnipotente e a voi, fratelli e sorelle, che ho molto peccato in pensieri, parole, opere e omissioni, per mia colpa, mia colpa, mia grandissima colpa. E supplico la beata sempre Vergine Maria, gli angeli, i santi e voi, fratelli e sorelle, di pregare per me il Signore Dio nostro.",
                        "celebrante": "Dio onnipotente abbia misericordia di noi, perdoni i nostri peccati e ci conduca alla vita eterna.",
                        "risposta": "Amen."
                    },
                    {
                        "id": "B",
                        "label": "Formula B - Pietà di noi",
                        "dialogue": [
                            {"c": "Pietà di noi, Signore.", "a": "Contro di te abbiamo peccato."},
                            {"c": "Mostraci, Signore, la tua misericordia.", "a": "E donaci la tua salvezza."}
                        ],
                        "celebrante": "Dio onnipotente abbia misericordia di noi, perdoni i nostri peccati e ci conduca alla vita eterna.",
                        "risposta": "Amen."
                    },
                    {
                        "id": "C",
                        "label": "Formula C - Invocazioni",
                        "dialogue": [
                            {"c": "Signore, mandato dal Padre a salvare i contriti di cuore, abbi pietà di noi.", "a": "Signore, pietà."},
                            {"c": "Cristo, che sei venuto a chiamare i peccatori, abbi pietà di noi.", "a": "Cristo, pietà."},
                            {"c": "Signore, che siedi alla destra del Padre e intercedi per noi, abbi pietà di noi.", "a": "Signore, pietà."}
                        ],
                        "celebrante": "Dio onnipotente abbia misericordia di noi, perdoni i nostri peccati e ci conduca alla vita eterna.",
                        "risposta": "Amen."
                    }
                ]
            },
            {
                "type": "kyrie",
                "rubric": "Se non è stata usata la formula C, seguono le invocazioni:",
                "dialogue": [
                    {"c": "Signore, pietà.", "a": "Signore, pietà."},
                    {"c": "Cristo, pietà.", "a": "Cristo, pietà."},
                    {"c": "Signore, pietà.", "a": "Signore, pietà."}
                ]
            }
        ]
    },
    "gloria": {
        "title": "Gloria",
        "sections": [
            {
                "type": "rubric",
                "text": "Nelle domeniche (escluse quelle di Avvento e di Quaresima), nelle solennità e nelle feste, si canta o si recita il Gloria."
            },
            {
                "type": "prayer",
                "text": "Gloria a Dio nell'alto dei cieli\ne pace in terra agli uomini di buona volontà.\n\nNoi ti lodiamo, ti benediciamo, ti adoriamo,\nti glorifichiamo, ti rendiamo grazie\nper la tua gloria immensa,\nSignore Dio, Re del cielo,\nDio Padre onnipotente.\n\nSignore, Figlio unigenito, Gesù Cristo,\nSignore Dio, Agnello di Dio, Figlio del Padre;\ntu che togli i peccati del mondo, abbi pietà di noi;\ntu che togli i peccati del mondo, accogli la nostra supplica;\ntu che siedi alla destra del Padre, abbi pietà di noi.\n\nPerché tu solo il Santo, tu solo il Signore,\ntu solo l'Altissimo, Gesù Cristo,\ncon lo Spirito Santo: nella gloria di Dio Padre. Amen."
            }
        ]
    },
    "credo": {
        "title": "Professione di Fede",
        "sections": [
            {
                "type": "choice",
                "label": "Simbolo",
                "options": [
                    {
                        "id": "niceno",
                        "label": "Simbolo Niceno-Costantinopolitano",
                        "text": "Credo in un solo Dio, Padre onnipotente,\ncreatore del cielo e della terra,\ndi tutte le cose visibili e invisibili.\n\nCredo in un solo Signore, Gesù Cristo,\nunigenito Figlio di Dio,\nnato dal Padre prima di tutti i secoli:\nDio da Dio, Luce da Luce, Dio vero da Dio vero;\ngenerato, non creato, della stessa sostanza del Padre;\nper mezzo di lui tutte le cose sono state create.\n\nPer noi uomini e per la nostra salvezza\ndiscese dal cielo;\n(si china il capo) e per opera dello Spirito Santo\nsi è incarnato nel seno della Vergine Maria e si è fatto uomo.\n\nFu crocifisso per noi sotto Ponzio Pilato,\nmorì e fu sepolto.\nIl terzo giorno è risuscitato, secondo le Scritture;\nè salito al cielo, siede alla destra del Padre.\nE di nuovo verrà, nella gloria,\nper giudicare i vivi e i morti,\ne il suo regno non avrà fine.\n\nCredo nello Spirito Santo,\nche è Signore e dà la vita,\ne procede dal Padre e dal Figlio,\ne con il Padre e il Figlio è adorato e glorificato,\ne ha parlato per mezzo dei profeti.\n\nCredo la Chiesa, una, santa, cattolica e apostolica.\nProfesso un solo battesimo per il perdono dei peccati.\nAspetto la risurrezione dei morti\ne la vita del mondo che verrà. Amen."
                    },
                    {
                        "id": "apostolico",
                        "label": "Simbolo Apostolico",
                        "text": "Io credo in Dio, Padre onnipotente,\ncreatore del cielo e della terra;\ne in Gesù Cristo, suo unico Figlio, nostro Signore,\nil quale fu concepito di Spirito Santo,\nnacque da Maria Vergine,\npatì sotto Ponzio Pilato,\nfu crocifisso, morì e fu sepolto;\ndiscese agli inferi;\nil terzo giorno risuscitò da morte;\nsalì al cielo, siede alla destra di Dio Padre onnipotente;\ndi là verrà a giudicare i vivi e i morti.\n\nCredo nello Spirito Santo,\nla santa Chiesa cattolica,\nla comunione dei santi,\nla remissione dei peccati,\nla risurrezione della carne,\nla vita eterna. Amen."
                    }
                ]
            }
        ]
    },
    "offertorio": {
        "title": "Liturgia Eucaristica - Presentazione dei doni",
        "sections": [
            {
                "type": "rubric",
                "text": "Il sacerdote, stando all'altare, prende la patena con il pane e, tenendola un poco sollevata, dice sottovoce:"
            },
            {
                "type": "prayer",
                "celebrante": "Benedetto sei tu, Signore, Dio dell'universo: dalla tua bontà abbiamo ricevuto questo pane, frutto della terra e del lavoro dell'uomo; lo presentiamo a te, perché diventi per noi cibo di vita eterna.",
                "assemblea": "Benedetto nei secoli il Signore."
            },
            {
                "type": "rubric",
                "text": "Il diacono, o il sacerdote, versa il vino e un po' d'acqua nel calice dicendo sottovoce: «L'acqua unita al vino sia segno della nostra unione con la vita divina di colui che ha voluto assumere la nostra natura umana». Poi il sacerdote prende il calice e, tenendolo un poco sollevato sull'altare, dice sottovoce:"
            },
            {
                "type": "prayer",
                "celebrante": "Benedetto sei tu, Signore, Dio dell'universo: dalla tua bontà abbiamo ricevuto questo vino, frutto della vite e del lavoro dell'uomo; lo presentiamo a te, perché diventi per noi bevanda di salvezza.",
                "assemblea": "Benedetto nei secoli il Signore."
            },
            {
                "type": "prayer",
                "rubric": "Inchinato, il sacerdote dice sottovoce:",
                "celebrante": "Umili e pentiti accoglici, o Signore: ti sia gradito il nostro sacrificio che oggi si compie dinanzi a te."
            },
            {
                "type": "prayer",
                "rubric": "Il sacerdote si lava le mani dicendo sottovoce: «Lavami, Signore, da ogni colpa, purificami da ogni peccato». Poi, in piedi al centro dell'altare, rivolto al popolo, allargando e ricongiungendo le mani, dice:",
                "celebrante": "Pregate, fratelli e sorelle, perché il mio e vostro sacrificio sia gradito a Dio, Padre onnipotente.",
                "assemblea": "Il Signore riceva dalle tue mani questo sacrificio a lode e gloria del suo nome, per il bene nostro e di tutta la sua santa Chiesa."
            }
        ]
    },
    "padre_nostro": {
        "title": "Riti di Comunione - Padre Nostro",
        "sections": [
            {
                "type": "monologue",
                "celebrante": "Obbedienti alla parola del Salvatore e formati al suo divino insegnamento, osiamo dire:"
            },
            {
                "type": "prayer",
                "text": "Padre nostro, che sei nei cieli,\nsia santificato il tuo nome,\nvenga il tuo regno,\nsia fatta la tua volontà,\ncome in cielo così in terra.\nDacci oggi il nostro pane quotidiano,\ne rimetti a noi i nostri debiti\ncome anche noi li rimettiamo ai nostri debitori,\ne non abbandonarci alla tentazione,\nma liberaci dal male."
            },
            {
                "type": "prayer",
                "celebrante": "Liberaci, o Signore, da tutti i mali, concedi la pace ai nostri giorni; e con l'aiuto della tua misericordia, vivremo sempre liberi dal peccato e sicuri da ogni turbamento, nell'attesa che si compia la beata speranza, e venga il nostro Salvatore Gesù Cristo.",
                "assemblea": "Tuo è il regno, tua la potenza e la gloria nei secoli."
            },
            {
                "type": "prayer",
                "rubric": "Rito della pace:",
                "celebrante": "Signore Gesù Cristo, che hai detto ai tuoi apostoli: «Vi lascio la pace, vi do la mia pace», non guardare ai nostri peccati, ma alla fede della tua Chiesa, e donale unità e pace secondo la tua volontà.\nTu che vivi e regni nei secoli dei secoli.",
                "assemblea": "Amen."
            },
            {
                "type": "dialogue",
                "celebrante": "La pace del Signore sia sempre con voi.",
                "assemblea": "E con il tuo spirito."
            },
            {
                "type": "rubric",
                "text": "Il diacono, o il sacerdote, può aggiungere: «Scambiatevi il dono della pace»."
            }
        ]
    },
    "comunione": {
        "title": "Frazione del Pane e Comunione",
        "sections": [
            {
                "type": "rubric",
                "text": "Il sacerdote spezza il pane consacrato, mentre si canta o si recita:"
            },
            {
                "type": "prayer",
                "text": "Agnello di Dio, che togli i peccati del mondo, abbi pietà di noi.\nAgnello di Dio, che togli i peccati del mondo, abbi pietà di noi.\nAgnello di Dio, che togli i peccati del mondo, dona a noi la pace."
            },
            {
                "type": "prayer",
                "rubric": "Il sacerdote mostra ai fedeli il pane eucaristico:",
                "celebrante": "Ecco l'Agnello di Dio, ecco colui che toglie i peccati del mondo. Beati gli invitati alla cena dell'Agnello.",
                "assemblea": "O Signore, non sono degno di partecipare alla tua mensa, ma di' soltanto una parola e io sarò salvato."
            },
            {
                "type": "rubric",
                "text": "Il sacerdote si comunica al Corpo e al Sangue di Cristo, poi distribuisce la comunione ai fedeli. Dopo la comunione, si osserva un tempo di silenzio, oppure si canta un inno o un salmo di lode."
            }
        ]
    },
    "riti_conclusione": {
        "title": "Riti di Conclusione",
        "sections": [
            {
                "type": "dialogue",
                "celebrante": "Il Signore sia con voi.",
                "assemblea": "E con il tuo spirito."
            },
            {
                "type": "choice",
                "label": "Benedizione",
                "options": [
                    {
                        "id": "A",
                        "label": "Benedizione Semplice",
                        "celebrante": "Vi benedica Dio onnipotente, Padre e Figlio ✠ e Spirito Santo.",
                        "assemblea": "Amen."
                    },
                    {
                        "id": "B",
                        "label": "Benedizione Solenne (esempio)",
                        "celebrante": "Dio, fonte di ogni consolazione, disponga i vostri giorni nella sua pace e vi conceda i doni della sua benedizione.\nAmen.\nVi liberi sempre da ogni pericolo e confermi i vostri cuori nel suo amore.\nAmen.\nCosì, ricchi di fede, di speranza e di carità, possiate progredire con impegno nelle opere buone, e giungere felicemente alla vita eterna.\nAmen.\nE su voi tutti, scenda la benedizione di Dio onnipotente, Padre e Figlio ✠ e Spirito Santo.",
                        "assemblea": "Amen."
                    }
                ]
            },
            {
                "type": "choice",
                "label": "Congedo",
                "options": [
                    {"id": "A", "celebrante": "La Messa è finita: andate in pace.", "assemblea": "Rendiamo grazie a Dio."},
                    {"id": "B", "celebrante": "Andate e annunciate il Vangelo del Signore.", "assemblea": "Rendiamo grazie a Dio."},
                    {"id": "C", "celebrante": "Glorificate il Signore con la vostra vita: andate in pace.", "assemblea": "Rendiamo grazie a Dio."},
                    {"id": "D", "celebrante": "Andate in pace.", "assemblea": "Rendiamo grazie a Dio."}
                ]
            }
        ]
    }
}

PREFACES = [
    {
        "id": "comune_1",
        "title": "Prefazio Comune I - Il rinnovamento di tutte le cose in Cristo",
        "season": "comune",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Signore, Padre santo, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nIn lui, uomo nuovo, hai rinnovato l'universo, e hai voluto che noi fossimo partecipi della sua redenzione.\n\nPer questo mistero di salvezza, uniti ai cori degli angeli, proclamiamo esultanti la tua lode:"
    },
    {
        "id": "comune_2",
        "title": "Prefazio Comune II - Il mistero della salvezza in Cristo",
        "season": "comune",
        "text": "È veramente cosa buona e giusta renderti grazie e innalzare a te l'inno di benedizione e di lode, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nRiconosciamo, Padre santo, la tua immensa gloria, mentre annunziamo le tue meraviglie in Cristo Gesù, nostro salvatore.\n\nEgli, Figlio prediletto e nostro redentore, da te inviato al mondo, agnello immolato per la nostra pasqua, ha compiuto la nostra salvezza. Per mezzo suo anche noi, popolo tuo e stirpe sacerdotale, offriamo il sacrificio a gloria del tuo nome, nell'attesa di partecipare al convito eterno nel tuo regno.\n\nPer questo mistero di salvezza, uniti agli angeli e ai santi, cantiamo senza fine l'inno della tua gloria:"
    },
    {
        "id": "avvento_1",
        "title": "Prefazio dell'Avvento I - Le due venute di Cristo",
        "season": "avvento",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Signore, Padre santo, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nAl suo primo avvento nell'umiltà della nostra natura umana egli portò a compimento la promessa antica, e ci aprì la via dell'eterna salvezza.\n\nVerrà di nuovo nello splendore della gloria, e ci chiamerà a possedere il regno promesso che ora osiamo sperare vigilanti nell'attesa.\n\nPer questo mistero di salvezza, uniti agli angeli e ai santi, cantiamo a una sola voce la tua gloria:"
    },
    {
        "id": "natale_1",
        "title": "Prefazio del Natale I - Cristo luce",
        "season": "natale",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Signore, Padre santo, Dio onnipotente ed eterno.\n\nNel mistero adorabile del Natale, egli, Verbo invisibile, apparve visibilmente nella nostra carne, per assumere in sé tutto il creato e sollevarlo dalla sua caduta. Così l'umanità, stupita di contemplare in lui il suo creatore, ritrova i lineamenti smarriti della sua nobile origine.\n\nPer questo mistero di salvezza, con tutti gli angeli del cielo, innalziamo a te, o Padre, l'inno di lode:"
    },
    {
        "id": "quaresima_1",
        "title": "Prefazio di Quaresima I - Il significato della Quaresima",
        "season": "quaresima",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Signore, Padre santo, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nCon questo tempo di grazia doni ai tuoi figli di rinnovarsi nello spirito, di servirti con amore di figli e di dedicarsi con fervore all'opera della redenzione, perché liberi dal fermento del peccato, attendano con gioia alla Pasqua ormai vicina, per vivere sempre nel Cristo il mistero dell'alleanza.\n\nPer questo dono della tua benevolenza, uniti ai cori degli angeli, proclamiamo insieme la tua gloria:"
    },
    {
        "id": "pasqua_1",
        "title": "Prefazio Pasquale I - Il mistero pasquale",
        "season": "pasqua",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, proclamare sempre la tua gloria, o Signore, e soprattutto esaltarti in questo giorno (tempo) in cui Cristo, nostra Pasqua, si è immolato.\n\nÈ lui il vero Agnello che ha tolto i peccati del mondo; è lui che morendo ha distrutto la morte e risorgendo ci ha ridato la vita.\n\nPer questo mistero, nella pienezza della gioia pasquale, l'umanità esulta su tutta la terra, e con l'assemblea degli angeli e dei santi canta l'inno della tua gloria:"
    },
    {
        "id": "ordinario_1",
        "title": "Prefazio Tempo Ordinario I - Il mistero pasquale e il popolo di Dio",
        "season": "ordinario",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Signore, Padre santo, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nCol suo sacrificio egli ha portato a compimento il mistero pasquale: ci ha liberati dalla schiavitù del peccato e della morte e ci ha chiamati alla gloria, perché, stirpe eletta, sacerdozio regale, gente santa, popolo di sua conquista, proclamiamo nel mondo i prodigi di colui che dalle tenebre ci ha chiamati allo splendore della sua luce.\n\nPer questo mistero di salvezza, uniti ai cori degli angeli, proclamiamo la tua gloria, cantando a una sola voce:"
    },
    {
        "id": "ordinario_2",
        "title": "Prefazio Tempo Ordinario II - Il mistero della salvezza",
        "season": "ordinario",
        "text": "È veramente cosa buona e giusta, nostro dovere e fonte di salvezza, rendere grazie sempre e in ogni luogo a te, Padre santo, Dio onnipotente ed eterno, per Cristo nostro Signore.\n\nEgli, mosso a pietà per la colpa dell'uomo, nascendo dalla Vergine si è degnato di aprirci la via della salvezza. Ora, morendo, ha distrutto la morte; risorgendo ha ridato a noi la vita.\n\nPer questo mistero di salvezza, con gli angeli e gli arcangeli, con i troni e le dominazioni, e con tutte le schiere dell'esercito celeste, cantiamo l'inno della tua gloria:"
    }
]

EUCHARISTIC_PRAYERS = [
    {
        "id": "pe1",
        "title": "Preghiera Eucaristica I (Canone Romano)",
        "description": "Antica anafora della Chiesa di Roma",
        "text": "Padre clementissimo, noi ti supplichiamo e ti chiediamo per Gesù Cristo, tuo Figlio e nostro Signore, di accettare e benedire ✠ questi doni, ✠ queste offerte, ✠ questo santo e immacolato sacrificio.\n\nNoi te l'offriamo anzitutto per la tua Chiesa santa e cattolica, perché tu le dia pace e la protegga, la raccolga nell'unità e la governi su tutta la terra, con il tuo servo il nostro Papa N., il nostro Vescovo N., e con tutti quelli che custodiscono la fede cattolica, trasmessa dagli Apostoli.\n\n[Memento dei vivi]\nRicordati, Signore, dei tuoi fedeli N. e N. Ricordati di tutti i presenti, dei quali conosci la fede e la devozione: per loro ti offriamo e anch'essi ti offrono questo sacrificio di lode, e innalzano la preghiera a te, Dio eterno, vivo e vero, per ottenere a sé e ai loro cari redenzione, sicurezza di vita e salute.\n\n[Comunione con i santi]\nIn comunione con tutta la Chiesa, ricordiamo e veneriamo anzitutto la gloriosa e sempre vergine Maria, Madre del nostro Dio e Signore Gesù Cristo, san Giuseppe, suo sposo, i santi apostoli e martiri: Pietro e Paolo, Andrea, [Giacomo, Giovanni, Tommaso, Giacomo, Filippo, Bartolomeo, Matteo, Simone e Taddeo, Lino, Cleto, Clemente, Sisto, Cornelio e Cipriano, Lorenzo, Crisogono, Giovanni e Paolo, Cosma e Damiano] e tutti i tuoi santi; per i loro meriti e le loro preghiere donaci sempre aiuto e protezione.\n\n[Accetta l'offerta]\nAccetta con benevolenza, o Signore, questa offerta che ti presentiamo noi tuoi ministri e tutta la tua famiglia: disponi nella tua pace i nostri giorni, salvaci dalla dannazione eterna, e accoglici nel gregge degli eletti.\n\n[Consacrazione del pane]\nSantifica, o Dio, questa offerta con la potenza della tua benedizione, e degnati di accettarla a nostro favore, in sacrificio spirituale e perfetto, perché diventi per noi il Corpo e il Sangue del tuo amatissimo Figlio, il Signore nostro Gesù Cristo.\n\nEgli, alla vigilia della sua passione, prese il pane nelle sue mani sante e venerabili, e alzando gli occhi al cielo a te Dio Padre suo onnipotente, rese grazie con la preghiera di benedizione, spezzò il pane, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\n[Consacrazione del calice]\nAllo stesso modo, dopo aver cenato, prese nelle sue mani sante e venerabili questo glorioso calice, ti rese grazie con la preghiera di benedizione, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\n[Anamnesi]\nIn questo sacrificio, o Padre, noi tuoi ministri e il tuo popolo santo celebriamo il memoriale della beata passione, della risurrezione dai morti e della gloriosa ascensione al cielo del Cristo tuo Figlio e nostro Signore; e offriamo alla tua maestà divina, tra i doni che ci hai dato, la vittima pura, santa e immacolata, pane santo della vita eterna e calice dell'eterna salvezza.\n\n[Intercessioni e dossologia finale]\nVolgi sulla nostra offerta il tuo sguardo sereno e benigno, come hai voluto accettare i doni di Abele, il giusto, il sacrificio di Abramo, nostro padre nella fede, e l'oblazione pura e santa di Melchisedek, tuo sommo sacerdote.\n\nTi supplichiamo, Dio onnipotente: fa' che questa offerta, per le mani del tuo angelo santo, sia portata sull'altare del cielo davanti alla tua maestà divina, perché su tutti noi che partecipiamo di questo altare, comunicando al santo mistero del Corpo e Sangue del tuo Figlio, scenda la pienezza di ogni grazia e benedizione del cielo.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pe2",
        "title": "Preghiera Eucaristica II",
        "description": "La più breve, adatta ai giorni feriali",
        "text": "Padre veramente santo, fonte di ogni santità, santifica questi doni con l'effusione del tuo Spirito perché diventino per noi il corpo e ✠ il sangue di Gesù Cristo nostro Signore.\n\nEgli, offrendosi liberamente alla sua passione, prese il pane e rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nDopo la cena, allo stesso modo, prese il calice e rese grazie, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando il memoriale della morte e risurrezione del tuo Figlio, ti offriamo, Padre, il pane della vita e il calice della salvezza, e ti rendiamo grazie per averci ammessi alla tua presenza a compiere il servizio sacerdotale.\n\nTi preghiamo umilmente: per la comunione al corpo e sangue di Cristo lo Spirito Santo ci riunisca in un solo corpo.\n\nRicordati, Padre, della tua Chiesa diffusa su tutta la terra: rendila perfetta nell'amore in unione con il nostro Papa N., il nostro Vescovo N., e tutto l'ordine sacerdotale.\n\nRicordati dei nostri fratelli e sorelle, che si sono addormentati nella speranza della risurrezione, e di tutti i defunti che affidiamo alla tua clemenza: ammettili a godere la luce del tuo volto.\n\nDi noi tutti abbi misericordia: donaci di aver parte alla vita eterna, insieme con la beata Maria, Vergine e Madre di Dio, san Giuseppe, suo sposo, con gli apostoli e tutti i santi, che in ogni tempo ti furono graditi: e in Gesù Cristo tuo Figlio canteremo la tua gloria.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pe3",
        "title": "Preghiera Eucaristica III",
        "description": "Per le domeniche e le feste",
        "text": "Padre veramente santo, a te la lode da ogni creatura. Per mezzo di Gesù Cristo, tuo Figlio e nostro Signore, nella potenza dello Spirito Santo fai vivere e santifichi l'universo, e continui a radunare intorno a te un popolo, che da un confine all'altro della terra offra al tuo nome il sacrificio perfetto.\n\nOra ti preghiamo umilmente: manda il tuo Spirito a santificare i doni che ti offriamo, perché diventino il corpo e ✠ il sangue di Gesù Cristo, tuo Figlio e nostro Signore, che ci ha comandato di celebrare questi misteri.\n\nNella notte in cui fu tradito, egli prese il pane, ti rese grazie con la preghiera di benedizione, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, dopo aver cenato, prese il calice, ti rese grazie con la preghiera di benedizione, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando il memoriale del tuo Figlio, morto per la nostra salvezza, gloriosamente risorto e asceso al cielo, nell'attesa della sua venuta ti offriamo, Padre, in rendimento di grazie, questo sacrificio vivo e santo.\n\nGuarda con amore e riconosci nell'offerta della tua Chiesa la vittima immolata per la nostra redenzione; e a noi che ci nutriamo del corpo e sangue del tuo Figlio dona la pienezza dello Spirito Santo perché diventiamo in Cristo un solo corpo e un solo spirito.\n\nLo Spirito Santo faccia di noi un'offerta perenne a te gradita, perché possiamo ottenere il regno promesso insieme con i tuoi eletti: con la beata Maria, Vergine e Madre di Dio, san Giuseppe, suo sposo, con i tuoi santi apostoli, i gloriosi martiri e tutti i santi, nostri intercessori presso di te.\n\nPer questo sacrificio di riconciliazione dona, Padre, pace e salvezza al mondo intero. Conferma nella fede e nell'amore la tua Chiesa pellegrina sulla terra: il tuo servo e nostro Papa N., il nostro Vescovo N., il collegio episcopale, tutto il clero e il popolo che tu hai redento.\n\nAscolta la preghiera di questa famiglia, che hai convocato alla tua presenza. Ricongiungi a te, Padre misericordioso, tutti i tuoi figli ovunque dispersi.\n\nAccogli nel tuo regno i nostri fratelli e sorelle defunti e tutti coloro che, in pace con te, hanno lasciato questo mondo; concedi anche a noi di ritrovarci insieme a godere per sempre della tua gloria in Cristo, nostro Signore, per mezzo del quale tu, o Dio, doni al mondo ogni bene.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pe4",
        "title": "Preghiera Eucaristica IV",
        "description": "Grande affresco della storia della salvezza",
        "text": "È veramente giusto renderti grazie, è bello cantare la tua gloria, Padre santo, unico Dio vivo e vero: prima del tempo e in eterno tu sei, nel tuo regno di luce infinita. Tu solo sei buono e fonte della vita, e hai dato origine a tutte le cose, per effondere la tua benedizione su tutte le creature e allietarle con lo splendore della tua luce.\n\nPer questo mistero, una moltitudine senza fine di angeli sta davanti a te e ti serve giorno e notte e contemplando la gloria del tuo volto, canta incessantemente la sua lode.\n\nCon essi anche noi, uniti a tutti gli esseri creati che sono sotto i cieli e ti acclamano con gioia, inneggiamo al tuo nome:\n\n[Santo]\n\nNoi ti lodiamo, Padre santo, per la tua grandezza: tu hai fatto ogni cosa con sapienza e amore. A tua immagine hai formato l'uomo, alle sue mani operose hai affidato l'universo perché nell'obbedienza a te, suo creatore, esercitasse il dominio su tutto il creato.\n\nE quando, per la sua disobbedienza, l'uomo perse la tua amicizia, tu non l'hai abbandonato in potere della morte, ma nella tua misericordia a tutti sei venuto incontro, perché coloro che ti cercano ti possano trovare. Molte volte hai offerto agli uomini la tua alleanza, e per mezzo dei profeti hai insegnato a sperare nella salvezza.\n\nE hai tanto amato il mondo, Padre santo, da mandare a noi, nella pienezza dei tempi, il tuo unico Figlio come Salvatore. Egli si è fatto uomo per opera dello Spirito Santo ed è nato dalla Vergine Maria, ha condiviso in tutto, fuorché nel peccato, la nostra condizione umana. Ai poveri annunziò il vangelo di salvezza, la libertà ai prigionieri, agli afflitti la gioia. Per attuare il tuo disegno di redenzione si consegnò volontariamente alla morte, e risorgendo distrusse la morte e rinnovò la vita.\n\nE perché non vivessimo più per noi stessi, ma per lui che è morto e risorto per noi, ha mandato, o Padre, lo Spirito Santo, primo dono ai credenti, a perfezionare la sua opera nel mondo e compiere ogni santificazione.\n\nOra ti preghiamo, Padre: lo Spirito Santo santifichi questi doni, perché diventino il corpo e ✠ il sangue di Gesù Cristo, nostro Signore, per la celebrazione di questo grande mistero, che ci ha lasciato in segno di eterna alleanza.\n\nEgli, venuta l'ora di essere glorificato da te, Padre santo, avendo amato i suoi che erano nel mondo, li amò sino alla fine. Mentre cenava con loro, prese il pane e rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, prese il calice colmo del frutto della vite, rese grazie, e lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nIn questo memoriale della nostra redenzione celebriamo, Padre, la morte di Cristo, la sua discesa agli inferi, proclamiamo la sua risurrezione e ascensione al cielo, dove siede alla tua destra; e, nell'attesa della sua venuta nella gloria, ti offriamo il suo corpo e sangue, sacrificio a te gradito e fonte di salvezza per il mondo intero.\n\nGuarda, o Signore, l'offerta che tu stesso hai preparato per la tua Chiesa; e a tutti coloro che mangeranno di quest'unico pane e berranno di quest'unico calice concedi che, riuniti in un solo corpo dallo Spirito Santo, diventino offerta viva in Cristo, a lode della tua gloria.\n\nOra, Padre, ricordati di tutti quelli per i quali ti offriamo questo sacrificio: del tuo servo e nostro Papa N., del nostro Vescovo N., del collegio episcopale, di tutto il clero, di coloro che si uniscono alla nostra offerta, dei presenti e del tuo popolo, e di tutti gli uomini che ti cercano con cuore sincero.\n\nRicordati di tutti i nostri fratelli e sorelle defunti, e di tutti coloro che, uscendo da questa vita, si sono affidati alla tua clemenza; ammettili a godere la luce del tuo volto e nella risurrezione dona loro la pienezza della vita.\n\nConcedi anche a noi, al termine di questo pellegrinaggio terreno, di giungere all'eterna dimora, dove tu ci attendi. In comunione con la beata Maria, Vergine e Madre di Dio, con san Giuseppe, suo sposo, con gli apostoli e i santi, nel tuo regno, insieme con tutte le creature liberate dalla corruzione del peccato e della morte, canteremo la tua gloria, in Cristo, nostro Signore, per mezzo del quale tu, o Dio, doni al mondo ogni bene.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "per_r1",
        "title": "Preghiera Eucaristica della Riconciliazione I",
        "description": "La riconciliazione in Cristo — per tempi penitenziali e di pace",
        "text": "Veramente è cosa buona renderti grazie, Padre santo, Dio di eterna gloria e di amore. Tu crei l'universo e cust​odisci le tue creature; inviti gli uomini al riconoscimento della tua grandezza e ai tuoi figli che si pentono offri sempre il perdono.\n\nTu non cessi mai di chiamare a un'alleanza più profonda i popoli che hai diviso dal peccato, e con il sacrificio del tuo Figlio fatto uomo li raduni tutti nell'unità del tuo amore.\n\nPer questo, con tutti gli angeli e i santi, cantiamo l'inno della tua lode:\n\n[Santo]\n\nTi lodiamo, Padre santo, per la tua grandezza: tu hai compiuto tutte le tue opere con sapienza e amore. Hai creato l'uomo a tua immagine, e gli hai affidato la terra, perché servendo a te solo, suo creatore, domini ogni cosa creata. E quando per la sua disobbedienza egli perdette la tua amicizia, non l'hai abbandonato in potere della morte, ma con grande misericordia a tutti sei venuto incontro, perché ti cercasse e ti potesse trovare.\n\nE poiché molte volte hai offerto alleanza agli uomini, e per mezzo dei profeti hai insegnato a sperare la salvezza, tu, o Padre, hai tanto amato il mondo da mandare a noi, nella pienezza dei tempi, il tuo unico Figlio come Salvatore.\n\nOra ti preghiamo, Padre misericordioso: manda il tuo Spirito a santificare i doni del pane e del vino, perché diventino per noi il corpo e ✠ il sangue di Gesù Cristo, nostro Signore.\n\nNella notte in cui fu tradito, mentre cenava con loro, egli prese il pane e, rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, prese il calice del vino, ti rese grazie con la preghiera di benedizione, e lo passò ai suoi discepoli, dicendo:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando, Padre santo, il memoriale della nostra riconciliazione, annunciamo l'opera del tuo amore: per la passione e la morte in croce il Cristo tuo Figlio, nostro Signore, è risuscitato dai morti nella gloria, e nella gloria è asceso al cielo. Nell'attesa che egli venga come nostro giudice e Signore, ti offriamo, o Padre, questa vittima di riconciliazione, che ci ridona la tua amicizia.\n\nVolgi, o Padre, il tuo sguardo sugli uomini redenti dal sacrificio del tuo Figlio: fa' che per la partecipazione all'unico pane e all'unico calice lo Spirito Santo ci riunisca in un solo corpo e ci trasformi in offerta viva in Cristo, a lode della tua gloria.\n\nRicordati, o Padre, di tutti quelli per i quali ti offriamo questo sacrificio: del tuo servo e nostro Papa N., del nostro Vescovo N., del collegio episcopale, di tutto il clero, dei presenti, e del tuo popolo radunato, e di tutti quelli che ti cercano con cuore sincero.\n\nRicordati anche dei nostri fratelli e sorelle che si sono addormentati nella pace di Cristo, e di tutti i defunti, dei quali tu solo hai conosciuto la fede: ammettili a godere della luce del tuo volto, e nella risurrezione dona loro la pienezza della vita.\n\nConcedi anche a noi, al termine del nostro pellegrinaggio terreno, di giungere alla dimora eterna dove tu ci attendi. In comunione con la beata Maria, Vergine e Madre di Dio, con san Giuseppe, suo sposo, gli apostoli e tutti i santi, ci sia dato di lodarti e glorificarti per Gesù Cristo tuo Figlio.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "per_r2",
        "title": "Preghiera Eucaristica della Riconciliazione II",
        "description": "Dio riconcilia e raduna i suoi figli",
        "text": "Veramente è cosa buona e giusta renderti grazie e lodarti, Padre santo, per Gesù Cristo, tuo Figlio e nostro Signore. In mezzo a un'umanità divisa e lacerata dalla discordia, noi sappiamo per esperienza che tu disponi gli animi alla riconciliazione. Con il tuo Spirito tu operi nell'intimo dei cuori: i nemici si aprono al dialogo, gli avversari si stringono la mano, i popoli si incontrano nella concordia.\n\nPer tuo dono, Padre, la ricerca sincera della pace estingue le contese, l'amore vince l'odio, la vendetta è disarmata dal perdono.\n\nPer questo non cessiamo di renderti grazie, e uniti al coro degli angeli a te innalziamo l'inno della nostra lode:\n\n[Santo]\n\nTi lodiamo, Padre santo, e ti glorifichiamo per il tuo amore: nel tuo Figlio Gesù Cristo, fatto uomo per la nostra salvezza, hai voluto ricostituire ogni cosa in cielo e sulla terra. Ora, mentre un mondo nuovo risorge dalle rovine del male, contempliamo già attuato il tuo disegno di riconciliazione.\n\nEffondi, o Padre, il tuo Spirito su queste offerte e santificale, perché diventino per noi il corpo e ✠ il sangue del Signore nostro Gesù Cristo, che ci ha comandato di celebrare questi misteri.\n\nEgli, nella notte in cui veniva tradito, prese il pane e ti rese grazie con la preghiera di benedizione, poi lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, al termine della cena, sapendo che avrebbe riconciliato ogni cosa in sé con il sangue versato sulla croce, prese il calice colmo del frutto della vite, di nuovo ti rese grazie e lo diede ai suoi discepoli, dicendo:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando, Padre santo, il memoriale del Cristo tuo Figlio, nostro Salvatore, che con la passione e la morte in croce hai fatto entrare nella gloria della risurrezione e chiamato alla tua destra, annunziamo l'opera del tuo amore fino a quando egli verrà, e ti offriamo il pane della vita e il calice della benedizione.\n\nGuarda con bontà l'offerta della tua Chiesa, nella quale si rende presente il sacrificio pasquale di Cristo a noi trasmesso, e concedi che nella potenza dello Spirito del tuo amore siamo annoverati, ora e per l'eternità, fra le membra del tuo Figlio, di cui portiamo il corpo e il sangue.\n\nPerfeziona, o Signore, la tua Chiesa nella fede e nella carità, in unione con il nostro Papa N., il nostro Vescovo N., il collegio episcopale, tutto l'ordine sacerdotale, il popolo che tu hai redento.\n\nApri i nostri occhi perché riconosciamo i bisogni dei fratelli, ispiraci parole e opere per confortare gli affaticati e gli oppressi; fa' che li serviamo sinceramente, sull'esempio e secondo il comandamento del Cristo. La tua Chiesa sia testimonianza viva di verità e di libertà, di giustizia e di pace, perché tutti gli uomini si aprano alla speranza di un mondo nuovo.\n\nRicordati dei nostri fratelli e sorelle defunti, e di tutti coloro che, credenti in te, hanno lasciato questo mondo: ammettili a godere della luce del tuo volto, e chiama anche noi, al termine di questa vita, a riunirci nella tua famiglia, con la beata Vergine Maria, Madre di Dio, con san Giuseppe, suo sposo, con i tuoi apostoli e i tuoi santi, e con i fratelli e le sorelle di tutti i tempi e luoghi, uniti nella tua lode, per Gesù Cristo tuo Figlio.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pvn_1",
        "title": "Preghiera Eucaristica per varie necessità I",
        "description": "La Chiesa in cammino verso l'unità",
        "text": "È veramente giusto renderti grazie, è bello cantare la tua gloria, Padre di misericordia infinita, Dio fedele. Tu ci hai creati con amore di Padre, e tu ci chiami a vivere da tuoi figli nella luce della verità. Nel tuo Figlio Gesù Cristo ci hai rigenerati a una speranza viva: poiché ci hai reso partecipi della sua gloriosa risurrezione, aspettiamo con gioia il giorno di Cristo, Signore nostro.\n\nPer questo dono della tua grazia, uniti ai cori degli angeli e dei santi, cantiamo con gioia l'inno della tua gloria:\n\n[Santo]\n\nTi benediciamo, Padre santo, perché grande è la tua gloria, e hai mandato il tuo Figlio a vivere con noi nella povertà e nell'umiltà della condizione umana, per liberarci da ogni schiavitù e renderci partecipi della tua vita divina.\n\nTi preghiamo: lo Spirito Santo santifichi questi doni, perché diventino il corpo e ✠ il sangue di Gesù Cristo, tuo Figlio e nostro Signore, per la celebrazione di questo grande mistero che egli stesso ci ha lasciato come segno di eterna alleanza.\n\nEgli, venuto tra noi, nella notte in cui fu tradito, prese il pane, rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, dopo la cena, prese il calice, rese grazie, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando il memoriale del Figlio tuo, morto per la nostra salvezza e gloriosamente risuscitato, nell'attesa della sua venuta, ti offriamo, o Padre, in rendimento di grazie, questo sacrificio vivo e santo.\n\nGuarda con amore, Padre santo, questa tua famiglia raccolta all'altare per questo sacrificio, nel quale il Cristo Signore ha versato il suo sangue e ha stabilito con noi la nuova alleanza: donaci lo Spirito Santo perché, purificati da ogni colpa, diventiamo in Cristo un solo corpo e un solo spirito.\n\nConferma, o Dio, nell'unità e nella carità la tua Chiesa santa, insieme al nostro Papa N., al nostro Vescovo N., e a tutti i Vescovi del mondo, al clero e al popolo che tu hai redento.\n\nRendi la tua Chiesa aperta a tutti, perché conosca il cammino della libertà e della pace, e tutti i tuoi figli possano incontrarsi come fratelli.\n\nRicordati dei nostri fratelli e sorelle defunti, [e di… ] e di tutti coloro che, credenti in te, hanno lasciato questo mondo: accoglili nella luce del tuo volto.\n\nA noi tutti, che siamo tuoi figli, concedi, nell'attesa beata, di godere la pienezza della tua gloria, per i secoli senza fine, insieme con la beata Vergine Maria, Madre di Dio, con san Giuseppe, suo sposo, con gli apostoli e i santi, nel regno dei cieli, dove, con tutto il creato libero dalla corruzione del peccato e della morte, ti glorificheremo per Cristo, Signore nostro: per mezzo di lui tu, Padre, doni al mondo ogni bene.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pvn_2",
        "title": "Preghiera Eucaristica per varie necessità II",
        "description": "Dio guida la sua Chiesa sulla via della salvezza",
        "text": "È veramente giusto renderti grazie, è bello cantare la tua gloria, Padre santo, perché non ti stanchi di guidare i tuoi figli, ma per mezzo del Cristo, nostro Signore, parli loro in ogni tempo e tendi loro la mano perché, liberati dal peccato, si uniscano a te, loro creatore.\n\nSenza mai venir meno, hai radunato il tuo popolo, perché dai confini della terra fino ai suoi limiti estremi offra alla tua gloria il sacrificio perfetto.\n\nPer questo anche noi, uniti ai cori degli angeli, in terra e nei cieli ti cantiamo l'inno della tua gloria:\n\n[Santo]\n\nTi benediciamo, Padre santo, Dio di eterna gloria e di amore, e proclamiamo la tua fedeltà nei secoli. Nel tuo Figlio prediletto, Gesù Cristo, nostro Signore e Salvatore, hai aperto agli uomini la via della libertà perfetta. Mediante la potenza del suo Spirito ci hai chiamati ad essere un solo popolo, perché, riunendoci al suo altare, celebrassimo le tue meraviglie.\n\nTi supplichiamo, o Padre: manda il tuo Spirito a santificare i doni del pane e del vino, perché diventino per noi il corpo e ✠ il sangue di Gesù Cristo, nostro Signore.\n\nNell'ultima cena, nella notte in cui fu tradito, egli prese il pane, ti rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, al termine della cena, prese il calice, rese grazie, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando, o Padre, il memoriale di Cristo tuo Figlio, nostro Salvatore, che con la passione e la morte di croce hai introdotto nella gloria della risurrezione, e chiamato alla tua destra, annunziamo l'opera del tuo amore, fino alla sua venuta nella gloria, e ti offriamo il pane della vita e il calice della benedizione.\n\nGuarda con amore, Padre santo, il sacrificio della tua Chiesa, e in esso riconosci la vittima del nostro riscatto; per la partecipazione al corpo e al sangue del tuo Figlio, fa' che possiamo essere ricolmi dello Spirito Santo, ed essere in Cristo un solo corpo e un solo spirito.\n\nLo Spirito Santo faccia di noi un'offerta perenne a te gradita, perché possiamo ottenere il regno promesso.\n\nRicordati, o Padre, della tua Chiesa, diffusa per tutta la terra, e uniscila nella carità, insieme al nostro Papa N., al nostro Vescovo N., a tutto l'ordine sacerdotale.\n\nRadunaci tutti, a Cristo, perché possiamo camminare nella giustizia e nella pace, ed essere nel mondo, con la forza della tua presenza, testimoni della tua verità.\n\nRicordati dei nostri fratelli e sorelle defunti, [e di … ], e di tutti coloro che, credenti in te, hanno lasciato questo mondo: ammettili a godere della luce del tuo volto.\n\nAl termine della nostra vita terrena, accoglici nella tua dimora, dove vive e regna, con te e con lo Spirito Santo, Cristo, tuo Figlio. In comunione con la beata Vergine Maria, Madre di Dio, con san Giuseppe, suo sposo, con gli apostoli e con tutti i santi, anche noi, glorificati con essi, ti loderemo ed esalteremo per Gesù Cristo, nostro Signore.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pvn_3",
        "title": "Preghiera Eucaristica per varie necessità III",
        "description": "Gesù, via per il Padre",
        "text": "È veramente giusto renderti grazie, è bello cantare la tua gloria, Padre di infinita bontà, per Gesù Cristo nostro Signore. Egli, che nei giorni della sua vita mortale cercò il bene degli uomini, manifestò con i prodigi delle sue opere l'amore della tua misericordia: egli è via che conduce a te, verità che ci libera, vita che ci riempie di gioia.\n\nPer mezzo del tuo Figlio tu continui a radunarci, come popolo che da un confine all'altro della terra si raccoglie per offrirti il sacrificio che ci rende graditi al tuo cospetto.\n\nPer questo anche noi, uniti ai cori degli angeli, a te innalziamo l'inno della nostra lode:\n\n[Santo]\n\nTi preghiamo, Padre onnipotente: effondi il tuo Spirito su questi doni, perché diventino il corpo e ✠ il sangue di Gesù Cristo, tuo Figlio e nostro Signore, nel quale anche noi siamo diventati tuoi figli.\n\nNell'ultima cena, nella notte in cui fu tradito, per consumare in tutto e per sempre il mistero pasquale, egli sedette a mensa con gli apostoli; prese il pane, rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, prese il calice, colmo del frutto della vite, rese grazie, e lo diede ai suoi discepoli, dicendo:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando, o Padre, il memoriale del Cristo, tuo Figlio, nostro Salvatore, che con la sua passione e morte di croce hai introdotto nella gloria della risurrezione e collocato alla tua destra, annunziamo l'opera del tuo amore, fino alla sua venuta, e ti offriamo il pane della vita e il calice della benedizione.\n\nGuarda con amore l'offerta della tua Chiesa, nella quale si rende presente il sacrificio pasquale del Cristo a noi trasmesso; e concedi che, nella potenza dello Spirito del tuo amore, siamo annoverati, ora e per l'eternità, tra i membri del tuo Figlio, di cui portiamo il corpo e il sangue.\n\nPer il sacrificio del nostro riscatto eterno conduci a perfezione, Padre santo, il tuo popolo, in unione con il nostro Papa N., il nostro Vescovo N., il collegio episcopale, tutto il clero, i fedeli che partecipano all'offerta e tutti coloro che si ricordano del tuo nome. Fa' che nel nome del Cristo, tuo Figlio, i fedeli siano pronti a venire incontro alle necessità dei fratelli, perché con essi partecipino alla gloria.\n\nRicordati dei nostri fratelli e sorelle defunti, [e specialmente di N.], e di tutti coloro che, credenti in te, hanno lasciato questo mondo: accoglili nel tuo regno, dove speriamo di essere con loro saziati eternamente della tua gloria.\n\nIn comunione con la beata Vergine Maria, Madre di Dio, con san Giuseppe, suo sposo, con gli apostoli, i martiri, e tutti i santi, ti benediciamo e ti glorifichiamo per Gesù Cristo, tuo Figlio.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    },
    {
        "id": "pvn_4",
        "title": "Preghiera Eucaristica per varie necessità IV",
        "description": "Gesù passa facendo del bene",
        "text": "È veramente giusto renderti grazie, è bello cantare la tua gloria, Padre santo, Dio onnipotente ed eterno, per Gesù Cristo, nostro Signore. Egli, l'uomo nuovo, è nato dalla Vergine Maria per la potenza dello Spirito Santo, per essere in mezzo a noi via della vita, via della giustizia e della pace. Amico dei piccoli e dei poveri, passava in mezzo alla gente sanando ogni male, segno di salvezza per coloro che cercavano la tua misericordia.\n\nAvendo amato i suoi che erano nel mondo, li amò sino alla fine e, per realizzare la tua salvezza, si consegnò alla morte e risorgendo distrusse la morte e rinnovò ogni cosa.\n\nPer questo insigne dono di redenzione, con tutte le creature che hai redento per il nostro Salvatore Gesù, innalziamo a te, Padre, l'inno di nostra lode:\n\n[Santo]\n\nTi benediciamo, Padre santo, perché, nella tua incessante provvidenza, hai radunato attorno al tuo Figlio un popolo, che riceve da te in dono lo Spirito, lavora per l'avvento del tuo regno, portando a tutti il lieto annunzio del Cristo.\n\nNoi ti preghiamo: santifica, Padre, queste offerte, con l'effusione del tuo Spirito, perché diventino per noi il corpo e ✠ il sangue di Gesù Cristo, nostro Signore, che ci ha comandato di celebrare questi misteri.\n\nNella notte in cui fu consegnato, e mentre sedeva a mensa con i suoi apostoli, prese il pane, ti rese grazie, lo spezzò, lo diede ai suoi discepoli, e disse:\n\nPRENDETE, E MANGIATENE TUTTI:\nQUESTO È IL MIO CORPO\nOFFERTO IN SACRIFICIO PER VOI.\n\nAllo stesso modo, prese il calice colmo del frutto della vite e, dopo aver reso grazie, lo diede ai suoi discepoli, dicendo:\n\nPRENDETE, E BEVETENE TUTTI:\nQUESTO È IL CALICE DEL MIO SANGUE\nPER LA NUOVA ED ETERNA ALLEANZA,\nVERSATO PER VOI E PER TUTTI\nIN REMISSIONE DEI PECCATI.\nFATE QUESTO IN MEMORIA DI ME.\n\nMistero della fede.\nAnnunciamo la tua morte, Signore, proclamiamo la tua risurrezione, nell'attesa della tua venuta.\n\nCelebrando, Padre santo, il memoriale di Cristo tuo Figlio, nostro Salvatore, che con la passione e la morte di croce hai introdotto nella gloria della risurrezione, e hai collocato alla tua destra, annunciamo l'opera del tuo amore fino a quando egli verrà, e ti offriamo il pane della vita e il calice della benedizione.\n\nGuarda con amore l'offerta della tua Chiesa, nella quale si rende presente il sacrificio pasquale del Cristo a noi trasmesso, e concedi che, nella potenza dello Spirito del tuo amore, siamo annoverati ora e per l'eternità fra le membra del tuo Figlio, di cui portiamo il corpo e il sangue.\n\nRinnova, Padre, con la forza di questo sacrificio la tua Chiesa, insieme al nostro Papa N., al nostro Vescovo N., e a tutti i Vescovi. Rendici attenti alle necessità di tutti, perché, condividendo i loro dolori e le loro gioie, indichiamo la via della salvezza e, nella comunione ecclesiale, diventiamo un segno più chiaro di fiducia e di speranza per tutti gli uomini.\n\nRicordati dei nostri fratelli e sorelle defunti [e di… ]: accoglili nel tuo regno di pace, dove speriamo di esser saziati eternamente della tua gloria.\n\nDonaci ancora, Padre, di giungere un giorno a quella vita eterna, dove con la beata Vergine Maria, Madre di Dio, con san Giuseppe, suo sposo, con gli apostoli, e i nostri fratelli e sorelle di tutti i tempi e luoghi, e le creature di tutto il creato, liberate dalla corruzione del peccato e della morte, ti glorificheremo per Cristo, Signore nostro: per mezzo di lui tu, Padre, doni al mondo ogni bene.\n\nPer Cristo, con Cristo e in Cristo, a te, Dio Padre onnipotente, nell'unità dello Spirito Santo, ogni onore e gloria per tutti i secoli dei secoli.\nAmen."
    }
]
