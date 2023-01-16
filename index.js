importScripts("https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.2/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.2/dist/wheels/panel-0.14.2-py3-none-any.whl', 'pyodide-http==0.1.0']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

import panel as pn
from panel.widgets import Button, Gauge, CrossSelector
import time
import re
import io
import zipfile

pn.extension()
pn.extension(sizing_mode="stretch_width", template="fast")

clean_files = []
clean_filenames = []
list_regex_default = [('Artikel regel 1' , r"(Artikel=[a-z0-9\.]{1,7})(.{1,})citeertitel=Besluitactiviteiten leefomgeving", r"${1}${2}citeertitel=Besluitactiviteiten leefomgeving: ${1}"),
              ('Artikel regel 2', ": Artikel=", ": artikel "),
              ('Nummers 1', "^3^", "3"),
              ('Nummers 2', "^2^", "2"),
              ('Enters', "<br />", ""),
              ('Various 1', "&lt;br /&gt;", ""),
              ('Various 2', "&lt;!-- --&gt;", ""),
              ('Various 3', "~", ""),
              ('Various 3', 
"\t\t<inter:regelgroepen>\\n\t\t</inter:regelgroepen>\\n", ""),
               ]

def on_press_download_button():
    print('test')
    # with zipfile.ZipFile('file.zip', 'w') as myzip:
    #     for filename, filecontent in zip(clean_filenames, clean_files):
    #         myzip.writestr(filename, filecontent)
    # myzip.close()
    # download_button.save('file.zip')


def on_add_regex_button():
    list_regex_default.append((textbox_regex_name.value, textbox_regex_from.value, textbox_regex_to.value))
    search_selector.options = list_regex_default
    search_selector.value = list_regex_default

def process_files():
    global clean_files
    global clean_filenames
    clean_files = []
    clean_filenames = []
    for file in file_input.value:
        with open(file, 'r') as f:
            content = f.read()
            for regex in search_selector.value:
                content = re.sub(regex[1], regex[2], content)
            clean_filenames.append(file.name)
            clean_files.append(content)
    #download_button.disabled = False
    progress_gauge.value = 1

# Create a file input component
file_input = pn.widgets.FileInput(multiple=True)

# Create a button to start processing the files.
process_button = Button(name='Process files', button_type="primary", width=200)
process_button.on_click(process_files)

# Create download button
#download_button = pn.widgets.FileDownload(filename="data.zip", callback=on_press_download_button, button_type="primary", disabled=True)

# Create a gauge bar to show the progress
progress_gauge = Gauge(name='Progress', value=0, width=300, title_size=10, colors=[(0.2, 'red'), (0.8, 'gold'), (1, 'green')])

# Create a crossSelector to search the input in each of the files
#search_selector = CrossSelector(name='Regular Expression', options=list_regex_default, value=list_regex_default, width=1000, definition_order=False)
search_selector = cross_selector = pn.widgets.CrossSelector(name='Fruits', value=['Apple', 'Pear'], 
    options=['Apple', 'Banana', 'Pear', 'Strawberry'])

# def search_selector_change(event):
#     print(event.new)

# search_selector.on_change("value", search_selector_change)

# Create textbox to add new regular expressions
textbox_regex_name = pn.widgets.TextInput(placeholder='Name')
textbox_regex_from = pn.widgets.TextInput(placeholder='From')
textbox_regex_to = pn.widgets.TextInput(placeholder='To')
add_regex_button = Button(name='Add', button_type="primary", width=200)
add_regex_button.on_click(on_add_regex_button)

# Create textbox to show processed files
textbox = pn.widgets.TextAreaInput(placeholder='Processed files are shown here..', width=1000, height=225)

# Create the layout
layout = pn.Column(file_input, process_button, search_selector, textbox_regex_name, textbox_regex_from, textbox_regex_to, add_regex_button, progress_gauge, textbox)#, download_button)

# Show the UI
#layout.show()
layout.servable()



await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()