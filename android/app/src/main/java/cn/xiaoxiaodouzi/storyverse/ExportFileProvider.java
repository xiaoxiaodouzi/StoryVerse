package cn.xiaoxiaodouzi.storyverse;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * 只读导出文件提供器。
 *
 * 它仅允许其他 App 临时读取 cache/exports 中的文件，不暴露业务数据库、
 * WebView localStorage 或 API 配置，也不需要申请 Android 存储权限。
 */
public final class ExportFileProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    private File resolve(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.contains("\\")) throw new FileNotFoundException();
        Context context = getContext();
        if (context == null) throw new FileNotFoundException();
        File root = new File(context.getCacheDir(), "exports");
        try {
            File target = new File(root, name).getCanonicalFile();
            if (!target.getPath().startsWith(root.getCanonicalPath() + File.separator) || !target.isFile()) throw new FileNotFoundException();
            return target;
        } catch (IOException error) { throw new FileNotFoundException(); }
    }

    @Override public String getType(Uri uri) {
        String name = uri.getLastPathSegment();
        return name != null && name.endsWith(".csv") ? "text/csv" : "application/json";
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = resolve(uri);String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor cursor = new MatrixCursor(columns);Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = file.getName();
                else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
            }
            cursor.addRow(values);return cursor;
        } catch (FileNotFoundException error) { return null; }
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("只允许读取导出文件");
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("只读"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
}
