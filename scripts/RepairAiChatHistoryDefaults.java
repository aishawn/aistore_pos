/**
 * Standalone JDBC maintenance tool, separate from the Spring application build.
 * Run inside the backend container with its existing POSTGRESQL_URL and app.jar.
 * Defaults to --dry-run (all DDL/data changes rolled back); --apply commits only
 * after row-count, orphan-preservation and rollback-only insertion checks pass.
 * Upload the SQL alongside the compiled class. Credentials are never printed.
 */
import java.sql.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
public class RepairAiChatHistoryDefaults {
 private static long[] counts(Connection c)throws SQLException {
  try(Statement s=c.createStatement();ResultSet r=s.executeQuery("SELECT (SELECT count(*) FROM public.ai_chat_thread),(SELECT count(*) FROM public.ai_chat_message),(SELECT count(*) FROM public.ai_chat_thread WHERE id IS NULL),(SELECT count(*) FROM public.ai_chat_message WHERE id IS NULL),(SELECT count(*) FROM public.ai_chat_message WHERE thread_id IS NULL)")){r.next();return new long[]{r.getLong(1),r.getLong(2),r.getLong(3),r.getLong(4),r.getLong(5)};}
 }
 public static void main(String[] args) throws Exception {
  try (JarFile boot=new JarFile("/app/app.jar")) {
   JarEntry pg=Collections.list(boot.entries()).stream().filter(e->e.getName().startsWith("BOOT-INF/lib/postgresql-")&&e.getName().endsWith(".jar")).findFirst().orElseThrow();
   Path jar=Files.createTempFile("history-pg-", ".jar");Files.copy(boot.getInputStream(pg),jar,StandardCopyOption.REPLACE_EXISTING);
   try(URLClassLoader loader=new URLClassLoader(new URL[]{jar.toUri().toURL()})) {
    Driver d=(Driver)loader.loadClass("org.postgresql.Driver").getConstructor().newInstance();
    String raw=System.getenv("POSTGRESQL_URL");Properties auth=new Properties();String jdbc=raw;
    if(!raw.startsWith("jdbc:")) {URI u=URI.create(raw);String[] info=u.getRawUserInfo().split(":",2);auth.setProperty("user",URLDecoder.decode(info[0],"UTF-8"));auth.setProperty("password",URLDecoder.decode(info[1],"UTF-8"));jdbc="jdbc:postgresql://"+u.getHost()+":"+u.getPort()+u.getRawPath()+(u.getRawQuery()==null?"":"?"+u.getRawQuery());}
    auth.setProperty("connectTimeout","6");
    try(Connection c=d.connect(jdbc,auth)) {
     c.setAutoCommit(false);
     long[] before=counts(c);
     String mode=args.length==0 ? "--dry-run" : args[0];
     if(!mode.equals("--dry-run") && !mode.equals("--apply")) throw new IllegalArgumentException("Expected --dry-run or --apply");
     String file=args.length>1 ? args[1] : "/tmp/repair-ai-chat-history-defaults.sql";
     try(Statement st=c.createStatement()){st.execute(Files.readString(Path.of(file)));}
     Savepoint probe=c.setSavepoint("history_probe");
     long thread;
     try(PreparedStatement st=c.prepareStatement("INSERT INTO public.ai_chat_thread(vendor_id,user_id,session_key,title) VALUES(1,1,?, 'Repair rollback probe') RETURNING id,created_at,updated_at")) {
      st.setString(1,"1:1:repair-probe-"+UUID.randomUUID());
      try(ResultSet r=st.executeQuery()){if(!r.next()||r.getObject(1)==null||r.getObject(2)==null||r.getObject(3)==null)throw new IllegalStateException("Thread defaults failed");thread=r.getLong(1);}
     }
     try(PreparedStatement st=c.prepareStatement("INSERT INTO public.ai_chat_message(thread_id,role,text_content) VALUES(?,'user','Repair rollback probe') RETURNING id,thread_id,created_at")) {
      st.setLong(1,thread);try(ResultSet r=st.executeQuery()){if(!r.next()||r.getObject(1)==null||r.getLong(2)!=thread||r.getObject(3)==null)throw new IllegalStateException("Message defaults failed");}
     }
     c.rollback(probe);
     long[] after=counts(c);
     if(before[0]!=after[0]||before[1]!=after[1]||after[2]!=0||after[3]!=0||before[4]!=after[4]) throw new IllegalStateException("History preservation check failed");
     System.out.println("VALIDATED threads="+after[0]+" messages="+after[1]+" nullThreadIds="+after[2]+" nullMessageIds="+after[3]+" preservedOrphanMessages="+after[4]+" rollbackProbe=PASS");
     if(mode.equals("--apply")){c.commit();System.out.println("REPAIR_COMMITTED");}else{c.rollback();System.out.println("DRY_RUN_ROLLED_BACK");}

    }
   }finally{Files.deleteIfExists(jar);}
  } catch(Exception e) {System.out.println("REPAIR_FAILED "+e.getClass().getSimpleName()+ (e instanceof SQLException ? " sqlState="+((SQLException)e).getSQLState() : ""));System.exit(1);}
 }
}
