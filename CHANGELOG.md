# Changelog

## 0.1.0 (unreleased)

- Write a page in blocks: text, headings, to-do, bulleted and numbered lists, toggle, quote, callout, table, code with syntax colors, equation and divider.
- Type `/` to pick a block from a menu, and type on to filter it.
- Select text to make it bold, italic, underlined, struck through, inline code, highlighted or a link, or to turn its block into another one.
- Hover a block to add a block under it or drag it to another place.
- Every block is read from and written to Markdown.
- Switch between Visual and Markdown mode with the buttons in the header or Cmd/Ctrl + /. Markdown mode shows the page as its file, with the title in the front matter.
- Keep a project as pages in folders: the sidebar lists them as a tree, where you add, open and delete pages and folders. A page's file is named after its title.
- See and edit a page's properties under its title. They are the front matter of its file: text, or a list such as tags.
- Open a folder on your computer as a project in the desktop app. Each page is a Markdown file in it, saved as you type, and a page or folder you delete moves to the trash.
- Sign in to your Polemic account in the desktop app, from the Account button. The sign-in happens in your browser, and Cursive keeps it in your system's credential store.
- Sync a project folder to your account. Changes travel both ways, also the ones you made offline, and two changes to the same page are both kept.
- Open a project from your account in an empty folder on another computer.
- Publish a project as a site with the Publish button: choose its address, publish again to bring it up to date, or unpublish it.
- Open and edit your projects in a browser, at `/cursive` on the Polemic server. What you type is saved to your account as you type.
- Make a presentation with the New presentation button in the sidebar. The sidebar lists its slides as small pictures: click one to work on it, drag it to another place, or delete it.
- Write each slide as a 16:9 page of blocks, with a layout (title, title and content, big number or quote) and speaker notes. Type a divider to start the next slide.
- See when a slide holds more than fits, and split it into two slides or make its text smaller.
- Present a presentation full screen with the Present button. The arrow keys and a click move between slides, and Esc ends it.
- A presentation is one Markdown file: slides between dividers, with a slide's layout in a `slide` code block and its notes in a `notes` code block.
- Add a quiz to a page from the `/` menu: a question, its options, which ones are correct, points, attempts and an explanation. In Markdown it is a `quiz` block with YAML inside.
- Add an assignment to a page from the `/` menu: a title, instructions, points and a due date. In Markdown it is an `assignment` block with YAML inside.
- Publish pages with quizzes or assignments as a tutorial: readers check their answers, see their points and mark pages as complete. Their progress is kept in their browser, and the correct answers stay on the server until a quiz is answered.
- Let readers of a tutorial sign in with a Polemic account to keep their progress in their account and hand in assignments as text. This needs a paid plan on the author's side.
- See who signed in to your tutorial from Publish → Learners: their completed pages, quiz points and handed-in work.
- Give a published site a theme in the Publish dialog: Cursive, Journal, Plum, Blueprint, Midnight or Poster. A theme sets the colors, typefaces and shapes of every page, slide and quiz.
