$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms, System.Web.Extensions
Add-Type -Language CSharp -ReferencedAssemblies System.Drawing, System.Windows.Forms, System.Web.Extensions -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class OpenCUMonitor : Form {
    private readonly JavaScriptSerializer serial = new JavaScriptSerializer { MaxJsonLength = 100000000, RecursionLimit = 36 };
    private readonly FlowLayoutPanel frames = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true };
    private bool exiting;
    protected override bool ShowWithoutActivation { get { return true; } }

    private OpenCUMonitor() {
        Text = "OpenCU";
        TopMost = true;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.SizableToolWindow;
        StartPosition = FormStartPosition.Manual;
        Rectangle screen = Screen.PrimaryScreen.WorkingArea;
        Bounds = new Rectangle(screen.Right - 364, screen.Bottom - 306, 340, 274);
        Controls.Add(frames);
        FormClosing += delegate(object sender, FormClosingEventArgs args) {
            if (exiting) return;
            args.Cancel = true;
            Hide();
            Write(new { @event = new { type = "hidden" } });
        };
    }

    private void Write(object value) { Console.WriteLine(serial.Serialize(value)); }
    private void Render(object[] source) {
        frames.SuspendLayout();
        try {
            while (frames.Controls.Count != 0) {
                Control item = frames.Controls[0];
                frames.Controls.RemoveAt(0);
                var picture = item as PictureBox;
                if (picture != null && picture.Image != null) picture.Image.Dispose();
                item.Dispose();
            }
            foreach (object item in source) {
                var row = (Dictionary<string, object>)item;
                object image;
                if (!row.TryGetValue("imageDataURL", out image) || !(image is string)) continue;
                string value = (string)image;
                var picture = new PictureBox {
                    Width = Math.Max(116, frames.ClientSize.Width - 36), Height = 180,
                    SizeMode = PictureBoxSizeMode.Zoom, TabStop = true, Cursor = Cursors.Hand,
                    AccessibleName = "Open monitored target"
                };
                try {
                    using (var bytes = new MemoryStream(Convert.FromBase64String(value.Substring(value.IndexOf(',') + 1))))
                    using (var decoded = Image.FromStream(bytes, false, true)) picture.Image = new Bitmap(decoded);
                } catch { picture.Dispose(); throw; }
                string id = Convert.ToString(row["presentationID"]);
                EventHandler focus = delegate { Write(new { @event = new { type = "focus", targetId = id } }); };
                picture.Click += focus;
                picture.KeyDown += delegate(object sender, KeyEventArgs args) { if (args.KeyCode == Keys.Enter) focus(sender, args); };
                frames.Controls.Add(picture);
            }
            if (frames.Controls.Count == 0) Hide();
            else if (!Visible) Show();
        } finally { frames.ResumeLayout(); }
    }

    private void Command(string line) {
        int id = 0;
        try {
            var command = serial.Deserialize<Dictionary<string, object>>(line);
            id = Convert.ToInt32(command["id"]);
            object result;
            switch (Convert.ToString(command["method"])) {
                case "hello":
                    result = new { protocol = 1, presentation = true };
                    break;
                case "update":
                    var parameters = (Dictionary<string, object>)command["params"];
                    var input = ((IList)parameters["frames"]);
                    var values = new object[input.Count];
                    input.CopyTo(values, 0);
                    Render(values);
                    result = new { rendered = Visible, visible = Visible, ownerPid = System.Diagnostics.Process.GetCurrentProcess().Id };
                    break;
                case "close":
                    Write(new { id = id, ok = true, result = new { released = true } });
                    exiting = true;
                    Close();
                    Application.ExitThread();
                    return;
                default:
                    throw new InvalidOperationException("Unknown monitor operation");
            }
            Write(new { id = id, ok = true, result = result });
        } catch (Exception error) {
            Write(new { id = id, ok = false, error = new { code = "PRESENTATION_RENDER_FAILED", message = error.Message } });
        }
    }

    public static void Run() {
        Application.EnableVisualStyles();
        using (var window = new OpenCUMonitor()) {
            var handle = window.Handle;
            var reader = new Thread(delegate() {
                try {
                    string line;
                    while ((line = Console.ReadLine()) != null) {
                        string command = line;
                        window.Invoke(new Action(delegate { window.Command(command); }));
                    }
                    window.Invoke(new Action(delegate { window.exiting = true; window.Close(); Application.ExitThread(); }));
                } catch (InvalidOperationException) { }
            });
            reader.IsBackground = true;
            reader.Start();
            Application.Run();
        }
    }
}
'@
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[OpenCUMonitor]::Run()
