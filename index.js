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

clean_files = []
clean_filenames = []
list_regex_default = ["Artikel regel 2<OOV>: Artikel=<OOV>: artikel",
                      "Nummers 1<OOV>^3^<OOV>3",
                      "Nummers 2<OOV>^2^<OOV>2",
                      "Enters<OOV><br /><OOV>",]

def on_press_download_button():
    global clean_files
    global clean_filenames
    output = io.BytesIO()
    zf = zipfile.ZipFile(output, mode='w')
    for filename, filecontent in zip(clean_filenames, clean_files):
        zf.writestr(filename, filecontent)
    zf.close()
    output.seek(0)
    return output

def on_add_regex_button(event):
    global list_regex_default
    # Add string to search_selector
    list_regex_default.append(str(textbox_regex_name.value)+"<OOV>"+str(textbox_regex_from.value)+"<OOV>"+textbox_regex_to.value)
    #print(list_regex_default)
    print('-----')
    search_selector.options = list_regex_default
    search_selector.param.trigger('value')
    #search_selector.force_new_dynamic_value()
    # print(list_regex_default)

    

#def on_save_button_press(event):
#    global clean_files
#    global clean_filenames
#    import io
#    import zipfile
#    output = io.BytesIO()
#    zf = zipfile.ZipFile(output, mode='w')
#    zf.writestr(clean_filenames[0], clean_files[0])
#    zf.writestr(clean_filenames[1], clean_files[1])
#    zf.close()
#    open('data.zip', 'wb').write(output.getbuffer())
#    with open(clean_filenames[0]+'_filter', 'w') as f:
#        f.writelines(clean_files[0])
    

# Create a file input component
file_input = pn.widgets.FileInput(multiple=True).servable(area="sidebar")

#file_input = pn.widgets.FileSelector('~')

# Create a button to start processing the files.
process_button = Button(name='Process files')

# Create a button to save button that contains the zipped files.
# save_button = Button(name='Save files')

# Create download button
download_button = pn.widgets.FileDownload(filename="data.zip", callback=on_press_download_button, button_type="primary", disabled=True)

# Create a gauge bar to show the progress
progress_gauge = Gauge(name='Progress', value=0, width=300, title_size=10, colors=[(0.2, 'red'), (0.8, 'gold'), (1, 'green')])

# Create a crossSelector to search the input in each of the files
search_selector = CrossSelector(name='Regular Expression', options=list_regex_default, value=list_regex_default, width=1000, definition_order=False)

# Create textbox to show processed files
textbox = pn.widgets.input.TextAreaInput(placeholder='Processed files are shown here..', width=1000, height=225)

# Create textbox to add new regular expressions
textbox_regex_name = pn.widgets.input.TextAreaInput(placeholder='regex name', width=250, height=50)
textbox_regex_from = pn.widgets.input.TextAreaInput(placeholder='regex expression', width=250, height=50)
textbox_regex_to = pn.widgets.input.TextAreaInput(placeholder='replace char', width=250, height=50)
add_regex_button = Button(name='Add regex', width=180, height=50)

# Create a callback function to handle the button press
def on_button_press(event):
    global clean_files
    global clean_filenames
    clean_files, clean_filenames = [], []
    textboxstring = ''
    progress_gauge.value = 0

    if process_button.clicks:
        regex = search_selector.value
        files = file_input.value
        #print(regex)

        if files is not None:
            # Iterate over the selected files
            for i, _ in enumerate(files):
                string = ''
                # Update process for files
                progress_gauge.value = (i + 1) / len(files) * 100
                # print(file_input.filename[i])

                for reg in regex:
                    # Do some processing here
                    #print('Replace %s with %s' %(reg[1], reg[2]))
                    string =  file_input.value[i].decode('utf-8')
                    reg = reg.split('<OOV>')
                    print('----')
                    print(reg[1])
                    print(reg[2])
                    print('----')
                    string = re.sub(reg[1], reg[2], string)
                    print('afterwards')
                    print(string)
                    #print(string[0:10])

                # Store clean filename
                clean_files.append(string)
                clean_filenames.append(file_input.filename[i])
                textbox.value = ', '.join(clean_filenames)
                
                #print(file_input.value[i])
                #print(file_input.filename[i])
                # time.sleep(0.1)

            if len(clean_files)>0:
                download_button.disabled = False


# Create the separator line
separator_vertical = pn.pane.HTML("""
    <style>
        .vertical {
            border-left: 1px solid black;
            height: 450px;
            position:absolute;
            left: 0%;
        }
    </style>

<div class= "vertical"></div>
""")    


# Link the button to the callback function
process_button.on_click(on_button_press)

# Link the regex button to the callback function
add_regex_button.on_click(on_add_regex_button)

# Link the button to the callback function
# save_button.on_click(on_save_button_press)


# Create the left-side panel
left_panel = pn.Column(
    "Upload files",
    file_input,
    pn.Spacer(width=50),  # Add some space between the panels
    process_button,
    progress_gauge,
    # save_button,
    download_button,
)


# Create the main top panel
top_panel = pn.Column()


# Create the main panel
main_panel = pn.Column(
    top_panel,    
    search_selector,
    pn.Row(textbox_regex_name, textbox_regex_from, textbox_regex_to, add_regex_button),
    pn.Row(textbox),
)


# Create the main dashboard
dashboard = pn.Row(
    left_panel,
    pn.Spacer(width=20),  # Set the left panel width to 20%
    separator_vertical,
    pn.Spacer(width=50),  # Add some space between the panels
    main_panel,
    pn.Spacer(width=10),  # Set the top panel width to 30%
)



# Serve the dashboard
dashboard.servable()       
pn.extension()
#pn.extension(sizing_mode="stretch_width", template="fast")
# panel serve hvplot_interactive.ipynb
#panel serve --show --autoreload


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