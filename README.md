# Il Mercatino

Sito statico per GitHub Pages basato su Google Sheet.

## Modifiche incluse

- Nome sito aggiornato: Il Mercatino
- Header aggiornato: Il Mercatino
- Favicon PNG inclusa: favicon.png
- Badge stato colorati:
  - Disponibile: verde
  - In trattativa: giallo
  - Esaurito: rosso
- Notifica flottante dopo la copia del riepilogo carrello
- Immagini ottimizzate con:
  - loading="lazy"
  - decoding="async"
  - dimensioni dichiarate
  - object-fit: contain per evitare tagli
- Carrello senza quantità: ogni prodotto è disponibile in singola unità
- Riepilogo carrello semplificato
- Popup fullscreen per immagini prodotto

## Colonne attese nel Google Sheet

- Nome articolo
- Tipo
- Prezzo
- Stato
- Note
- Link
- Immagine

## Stati consigliati

Per ottenere i colori corretti nei badge, usa esattamente questi valori nella colonna Stato:

- Disponibile
- In trattativa
- Esaurito

## Requisiti

Il Google Sheet deve essere pubblico con permesso Visualizzatore.
Anche le immagini devono essere accessibili pubblicamente.

## File da caricare su GitHub Pages

- index.html
- style.css
- script.js
- favicon.png
- README.md
