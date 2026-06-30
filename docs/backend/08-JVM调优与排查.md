# 08 · JVM 调优与线上排查

> 给前端同学的 JVM 入门。Java 程序跑在 JVM（Java 虚拟机）上，内存和 GC（垃圾回收）是排查线上问题的重点。

## 一、JVM 内存区域（够用版）

| 区域 | 存什么 | 出问题表现 |
|------|--------|-----------|
| **堆 Heap** | 对象实例（最大、最常出问题） | OOM: Java heap space |
| 栈 Stack | 方法调用、局部变量 | StackOverflowError（递归过深）|
| 方法区/Metaspace | 类元数据 | OOM: Metaspace |
| 直接内存 | NIO/Netty 堆外 | OOM: Direct buffer memory |

堆又分**新生代（Young）**和**老年代（Old）**：新对象先进 Young，活得久的晋升到 Old。

## 二、GC（垃圾回收）基础
- 回收没人引用的对象，释放内存。
- **Young GC（Minor GC）**：回收新生代，频繁但快。
- **Full GC**：回收整个堆，慢、会"Stop The World"（暂停所有业务线程）。
- **排查核心：Full GC 是否频繁、每次耗时多久**——频繁 Full GC 会导致接口卡顿。
- 常用收集器：G1（默认主流）、ZGC（低延迟，大堆）。

## 三、常用启动参数
```bash
java -Xms2g -Xmx2g \              # 初始/最大堆，生产建议设成相等避免动态扩展
     -Xmn1g \                     # 新生代大小
     -XX:+UseG1GC \               # 用 G1 收集器
     -XX:+HeapDumpOnOutOfMemoryError \   # OOM 时自动导出堆快照
     -XX:HeapDumpPath=/data/dump/ \
     -Xlog:gc*:file=/data/gc.log \       # GC 日志（JDK11+）
     -jar app.jar
```

## 四、排查流程

### 1. 看进程和资源
```bash
jps -l                 # 列出 Java 进程和主类
top -Hp <pid>          # 看该进程哪个线程吃 CPU
jstat -gcutil <pid> 1000   # 每秒打印 GC 情况（重点看 FGC 次数/FGCT 耗时）
```

### 2. CPU 飙高
```bash
top -Hp <pid>                      # 找到高 CPU 的线程 ID（十进制）
printf '%x\n' <线程ID>             # 转成十六进制
jstack <pid> | grep -A 30 <十六进制ID>   # 看这个线程在干什么
```

### 3. 内存泄漏 / OOM
```bash
jmap -histo:live <pid> | head -30  # 看哪些类的对象最多
jmap -dump:live,format=b,file=heap.hprof <pid>   # 导出堆快照
# 用 MAT (Eclipse Memory Analyzer) 或 VisualVM 分析 hprof，找泄漏点
```

### 4. 神器 Arthas（强烈推荐）
线上不重启、动态诊断：
```bash
dashboard            # 实时看 CPU/内存/GC/线程总览
thread -n 5          # 最忙的 5 个线程
trace 类 方法         # 看某方法各步骤耗时（定位慢在哪）
watch 类 方法 '{params,returnObj}'   # 看方法入参/返回值
jad 类               # 反编译看线上实际运行的代码
```

## 五、常见线上问题对照
| 现象 | 可能原因 | 排查 |
|------|---------|------|
| 接口周期性卡顿 | 频繁 Full GC | `jstat -gcutil`，看 FGC |
| 内存持续涨、最终 OOM | 内存泄漏 | `jmap` 导堆 + MAT 分析 |
| CPU 100% | 死循环/热点方法 | `top -Hp` + `jstack` 或 Arthas trace |
| 服务假死无响应 | 线程池满/死锁 | `jstack` 看线程状态、死锁 |

## 六、和前端对照理解
- JVM 堆 ≈ 浏览器 JS 堆；Full GC ≈ 一次大的垃圾回收卡顿。
- `jstack` ≈ 看调用栈；Arthas `trace` ≈ Performance 面板看函数耗时。
- OOM ≈ 前端内存泄漏导致页面越来越卡，原理相通，只是工具不同。
