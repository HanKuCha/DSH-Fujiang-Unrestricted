from pathlib import Path

p = Path('work/src/DSHInstaller.cs')
s = p.read_text(encoding='utf-8-sig')
s = s.replace('using System.Text.Json;\nusing System.Text.Json.Nodes;', 'using System.Web.Script.Serialization;\nusing System.Collections;')
s = s.replace('            Application.EnableVisualStyles();', '''            var logRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DSH-Fujiang-Installer", "logs");
            try { Directory.CreateDirectory(logRoot); }
            catch { logRoot = Path.GetTempPath(); }
            LogPath = Path.Combine(logRoot, "installer-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".log");
            var writer = TextWriter.Synchronized(new StreamWriter(LogPath, false, new UTF8Encoding(false)) { AutoFlush = true });
            Console.SetOut(writer);
            Console.SetError(writer);
            Console.WriteLine("Installer 1.0.2; OS=" + Environment.OSVersion + "; 64bitOS=" + Environment.Is64BitOperatingSystem);
            Application.ThreadException += (sender, e) => ReportError(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (sender, e) => Console.Error.WriteLine(e.ExceptionObject);
            Application.EnableVisualStyles();''', 1)
s = s.replace('if (mode == "install" && args.Any', 'if (mode != "uninstall" && args.Any')
s = s.replace('        private static int RunSilent', '''        internal static string LogPath;

        internal static void ReportError(Exception error)
        {
            Environment.ExitCode = 1;
            Console.Error.WriteLine(error);
            MessageBox.Show(error.Message + "\\r\\n\\r\\n日志：" + LogPath, "安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }

        private static int RunSilent''')
s = s.replace('                var error = task.Exception == null', '                Environment.ExitCode = 1;\n                Console.Error.WriteLine(task.Exception);\n                var error = task.Exception == null')
s = s.replace('Append("安装失败：" + error);', 'Append("安装失败：" + error);\n                Append("日志：" + Program.LogPath);')
s = s.replace('安装未完成。原有 profile 已自动备份，可在备份目录中恢复。', '安装未完成。若已进入写入阶段，备份位置见日志；修正错误后可重试。')
s = s.replace('            var result = task.Result;', '            Environment.ExitCode = 0;\n            var result = task.Result;')
s = s.replace('                    MessageBox.Show(this, error.Message, Program.ProductDisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);', '                    Program.ReportError(error);')
s = s.replace('                return home;', '                return Path.GetFullPath(Environment.ExpandEnvironmentVariables(home.Trim().Trim(\'"\')));')
start = s.index('            var candidates = new List<string>')
end = s.index('            foreach (var candidate in candidates)', start)
s = s[:start] + '''            var candidates = new List<string>
            {
                Path.Combine(local, "Programs", "DeepSeek Harness", "DeepSeek Harness.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "DeepSeek Harness", "DeepSeek Harness.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "DeepSeek Harness", "DeepSeek Harness.exe")
            };
            foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
            foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
            {
                try
                {
                    using (var root = RegistryKey.OpenBaseKey(hive, view))
                    using (var uninstall = root.OpenSubKey(@"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall"))
                    {
                        if (uninstall == null) continue;
                        foreach (var name in uninstall.GetSubKeyNames())
                        using (var key = uninstall.OpenSubKey(name))
                        {
                            if (key == null || !string.Equals(key.GetValue("DisplayName") as string, "DeepSeek Harness", StringComparison.OrdinalIgnoreCase)) continue;
                            var location = key.GetValue("InstallLocation") as string;
                            if (!string.IsNullOrWhiteSpace(location)) candidates.Add(Path.Combine(location.Trim('"'), "DeepSeek Harness.exe"));
                        }
                    }
                }
                catch (System.Security.SecurityException) { }
                catch (UnauthorizedAccessException) { }
            }
''' + s[end:]
s = s.replace('            var payload = Path.Combine(packageRoot, "payload");', '''            dshHome = Path.GetFullPath(dshHome);
            dshExecutable = Path.GetFullPath(dshExecutable);
            Console.WriteLine("DSH_HOME=" + dshHome);
            Console.WriteLine("DSH_EXE=" + dshExecutable);
            if (Process.GetProcessesByName("DeepSeek Harness").Length > 0)
                throw new InvalidOperationException("请完全退出 DSH Desktop 后再安装，避免运行中的程序覆盖配置。");
            var cli = Path.Combine(Path.GetDirectoryName(dshExecutable), "resources", "runtime", "cli", "bin", "dsh.cmd");
            if (!File.Exists(cli))
                throw new FileNotFoundException("找不到随 DSH Desktop 安装的 CLI，请选择正确的 DeepSeek Harness.exe。", cli);

            var payload = Path.Combine(packageRoot, "payload");''')
s = s.replace('            Console.WriteLine("STEP backup profile");', '''            // Validate the profile before making any changes.
            var checkedProfile = ReadJson(profilePackage);
            GetDependencies(checkedProfile);
            GetBundles(checkedProfile);
            Console.WriteLine("STEP backup profile");''')
s = s.replace('            var backup = CreateBackup(dshHome);', '            var backup = CreateBackup(dshHome);\n            Console.WriteLine("BACKUP=" + backup);')
start = s.index('            var packageJson = ReadJson(profilePackage);')
end = s.index('            Console.WriteLine("STEP disable duplicate', start)
s = s[:start] + '''            var mutable = ReadJson(profilePackage);
            UpsertDependency(mutable, Program.PackageId, "link:" + targetPlugin.Replace("\\\\", "/"));
            UpsertBundle(mutable, Program.PackageId);
            WriteJson(profilePackage, mutable);

''' + s[end:]
start = s.index('            Console.WriteLine("STEP optional dependency sync");')
end = s.index('            return new InstallResult', start)
s = s[:start] + '''            Console.WriteLine("STEP dependency sync");
            var output = RunCli(cli, dshHome, 300000, "plugin", "--profile", "desktop", "install");
            var cliOutput = new List<string>(Lines(output));
            var installedPreset = Path.Combine(profileRoot, "node_modules", "@local", "dsh-ws-helper-preset", "cordis.patch.yml");
            if (!File.Exists(installedPreset) || !string.Equals(HashFile(installedPreset), Program.ExpectedHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("依赖同步后未找到正确的预设链接，安装未完成。备份：" + backup);
            Console.WriteLine("STEP verified installed preset");

''' + s[end:]
start = s.index('            var packageJson = ReadJson(profilePackage);')
end = s.index('            var lines = File.ReadAllLines', start)
s = s[:start] + '''            var mutable = ReadJson(profilePackage);
            RemoveDependency(mutable, Program.PackageId);
            RemoveBundle(mutable, Program.PackageId);
            WriteJson(profilePackage, mutable);

''' + s[end:]
s = s.replace('DateTime.Now.ToString("yyyyMMdd-HHmmss")', 'DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6)')
start = s.index('        private static JsonDocument ReadJson')
end = s.index('        private static string RunCli', start)
s = s[:start] + '''        private static JavaScriptSerializer Serializer()
        {
            return new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 256 };
        }

        private static Dictionary<string, object> ReadJson(string file)
        {
            var root = Serializer().DeserializeObject(File.ReadAllText(file)) as Dictionary<string, object>;
            if (root == null) throw new InvalidDataException("profile package.json 必须是 JSON 对象。");
            return root;
        }

        private static Dictionary<string, object> GetObject(Dictionary<string, object> root, string key)
        {
            object value;
            if (!root.TryGetValue(key, out value) || !(value is Dictionary<string, object>))
                throw new InvalidDataException("profile package.json 缺少对象：" + key);
            return (Dictionary<string, object>)value;
        }

        private static Dictionary<string, object> GetDependencies(Dictionary<string, object> root)
        {
            return GetObject(root, "dependencies");
        }

        private static IList GetBundles(Dictionary<string, object> root)
        {
            var profile = GetObject(GetObject(root, "dsh"), "profile");
            object value;
            if (!profile.TryGetValue("bundles", out value) || !(value is IList))
                throw new InvalidDataException("profile package.json 缺少 dsh.profile.bundles 数组。");
            return (IList)value;
        }

        private static void UpsertDependency(Dictionary<string, object> root, string name, string value)
        {
            GetDependencies(root)[name] = value;
        }

        private static void RemoveDependency(Dictionary<string, object> root, string name)
        {
            GetDependencies(root).Remove(name);
        }

        private static void UpsertBundle(Dictionary<string, object> root, string name)
        {
            var bundles = new ArrayList(GetBundles(root));
            if (!bundles.Contains(name)) bundles.Add(name);
            GetObject(GetObject(root, "dsh"), "profile")["bundles"] = bundles;
        }

        private static void RemoveBundle(Dictionary<string, object> root, string name)
        {
            var bundles = new ArrayList(GetBundles(root));
            while (bundles.Contains(name)) bundles.Remove(name);
            GetObject(GetObject(root, "dsh"), "profile")["bundles"] = bundles;
        }

        private static void WriteJson(string file, Dictionary<string, object> root)
        {
            File.WriteAllText(file, Serializer().Serialize(root) + Environment.NewLine, new UTF8Encoding(false));
        }

''' + s[end:]
s = s.replace('                FileName = cli,', '''                FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe"),
                Arguments = "/d /v:off /s /c \\"\\"%DSH_INSTALLER_CLI%\\" plugin --profile desktop install\\"",'''.replace('\\"','\\"'))
s = s.replace('            foreach (var arg in args) info.ArgumentList.Add(arg);\n            info.Environment["DSH_HOME"] = dshHome;', '''            info.EnvironmentVariables["DSH_HOME"] = dshHome;
            info.EnvironmentVariables["DSH_INSTALLER_CLI"] = cli;''')
s = s.replace('                    try { process.Kill(true); } catch { }', '''                    try
                    {
                        using (var killer = Process.Start(new ProcessStartInfo
                        {
                            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"),
                            Arguments = "/PID " + process.Id + " /T /F",
                            UseShellExecute = false, CreateNoWindow = true
                        })) { killer.WaitForExit(5000); }
                    }
                    catch { try { process.Kill(); } catch { } }''')
s = s.replace(' 秒，已跳过。', ' 秒，安装未完成。')
s = s.replace('                if (process.ExitCode != 0)', '                Console.WriteLine(output);\n                Console.Error.WriteLine(error);\n                if (process.ExitCode != 0)')
s = s.replace('"：" + error);', '"：" + output + Environment.NewLine + error);')
p.write_text(s, encoding='utf-8-sig')
