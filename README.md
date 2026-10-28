# Chat Textmarker (Opera GX Extension)

Textmarker für **Gemini**, **ChatGPT** und **Claude**. Markierungen werden pro Chat lokal gespeichert und beim nächsten Öffnen wiederhergestellt.

## Installation in Opera GX
1. `opera://extensions` öffnen
2. Oben rechts **Entwicklermodus** einschalten
3. **Entpackte Erweiterung laden** → diesen Ordner (`MarkExtension`) auswählen
4. Extension anpinnen (Puzzle-Symbol in der Leiste)

## Benutzung
- Der Textmarker ist sofort aktiv: Text in einer Nachricht markieren = gelb markiert
- Rechts oben erscheint eine kleine Leiste mit **🖍️ Textmarker** und **🧽 Radierer**
  - Radierer: Klick auf eine Markierung löscht sie, Darüberziehen löscht jede berührte Markierung
- Klick aufs Extension-Icon, `Strg+M` oder `Alt+Shift+L` schaltet den Textmarker ein/aus
- Mit **▲ / ▼** in der Leiste (oder `Alt+↑` / `Alt+↓`) springt man wie bei Strg+F durch alle Markierungen im Chat; der Zähler zeigt z. B. `2/5`

## Hinweise
- Wenn Gemini, ChatGPT oder Claude ihr Layout ändern, müssen eventuell die Selektoren in `SITES` (`content.js`) angepasst werden.
