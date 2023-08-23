import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './styles.module.scss';
import TableCell from 'renderer/screens/DatabaseScreen/QueryResultViewer/TableCell/TableCell';
import { QueryResultHeader } from 'types/SqlResult';
import { getUpdatableTable } from 'libs/GenerateSqlFromChanges';
import { useSchema } from 'renderer/contexts/SchemaProvider';
import { useContextMenu } from 'renderer/contexts/ContextMenuProvider';
import { useQueryResultChange } from 'renderer/contexts/QueryResultChangeProvider';
import { useTableCellManager } from './TableCellManager';
import OptimizeTable from 'renderer/components/OptimizeTable';
import Icon from 'renderer/components/Icon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusCircle, faTimesCircle } from '@fortawesome/free-solid-svg-icons';

interface QueryResultTableProps {
  headers: QueryResultHeader[];
  result: { data: Record<string, unknown>; rowIndex: number }[];
  page: number;
  pageSize: number;
}

function QueryResultTable({
  headers,
  result,
  page,
  pageSize,
}: QueryResultTableProps) {
  const [newRowCount, setNewRowCount] = useState(0);
  const { collector } = useQueryResultChange();
  const { cellManager } = useTableCellManager();
  const { schema, currentDatabase } = useSchema();

  const [selectedRowsIndex, setSelectedRowsIndex] = useState<number[]>([]);
  const [removeRowsIndex, setRemoveRowsIndex] = useState<number[]>([]);

  const newRowsIndex = useMemo(
    () => new Array(newRowCount).fill(0).map((_, idx) => idx),
    [newRowCount]
  );

  useEffect(() => {
    const onChangeUpdate = () => {
      setNewRowCount(collector.getNewRowCount());
      setRemoveRowsIndex(collector.getRemovedRowsIndex());
    };

    collector.registerChange(onChangeUpdate);
    return () => collector.unregisterChange(onChangeUpdate);
  }, [collector, setNewRowCount]);

  const handleSelectedRowsChange = (selectedRows: number[]) => {
    setSelectedRowsIndex(selectedRows);
  };

  const { handleContextMenu } = useContextMenu(() => {
    const selectedCell = cellManager.getFocusCell();

    return [
      {
        text: 'Insert new row',
        onClick: () => {
          collector.createNewRow();
        },
        icon: <FontAwesomeIcon icon={faPlusCircle} color="#27ae60" />,
      },
      {
        text: 'Remove selected rows',
        destructive: true,
        disabled: selectedRowsIndex.length === 0,
        onClick: () => {
          for (const selectedRowIndex of selectedRowsIndex) {
            collector.removeRow(
              selectedRowIndex - newRowCount < 0
                ? selectedRowIndex - newRowCount
                : selectedRowIndex - newRowCount + page * pageSize
            );
          }
        },
        icon: <FontAwesomeIcon icon={faTimesCircle} />,
        separator: true,
      },
      {
        text: 'Insert NULL',
        disabled: !selectedCell,
        onClick: () => selectedCell?.insert(null),
        separator: true,
      },
      {
        text: 'Copy',
        hotkey: 'Ctrl + C',
        disabled: !selectedCell,
        onClick: () => selectedCell?.copy(),
      },
      {
        text: 'Paste',
        hotkey: 'Ctrl + V',
        disabled: !selectedCell,
        onClick: () => selectedCell?.paste(),
        separator: true,
      },
      {
        text: `Discard All Changes`,
        destructive: true,
        disabled: !collector.getChangesCount(),
        onClick: () => {
          const rows = collector.getChanges().changes;

          for (const row of rows) {
            for (const col of row.cols) {
              const cell = cellManager.get(row.row, col.col);
              if (cell) {
                cell.discard();
              }
            }
          }

          collector.clear();
        },
      },
    ];
  }, [collector, newRowCount, selectedRowsIndex, page, pageSize]);

  const data: { data: Record<string, unknown>; rowIndex: number }[] =
    useMemo(() => {
      const newRows = new Array(newRowCount)
        .fill(false)
        .map((_, newRowIndex) => {
          return {
            rowIndex: -(newRowIndex + 1),
            data: headers.reduce(
              (prev, header) => ({ ...prev, [header.name]: undefined }),
              {}
            ),
          };
        });

      return [...newRows, ...result];
    }, [result, newRowCount]);

  const updatableTables = useMemo(() => {
    if (headers && currentDatabase && schema) {
      return getUpdatableTable(headers, schema[currentDatabase]);
    }
    return {};
  }, [result, schema, currentDatabase]);

  if (!headers || !result) {
    return <div>No result</div>;
  }

  const headerMemo = useMemo(() => {
    function getInitialSizeByHeaderType(_: number, header: QueryResultHeader) {
      if (header.type.type === 'number') {
        return 100;
      } else if (
        header.type.type === 'string' ||
        header.type.type === 'decimal'
      ) {
        // Check the last 100 records
        const maxLength = Math.max(
          ...result.slice(0, 100).map(({ data: row }) => {
            if (typeof row[header.name] === 'string')
              return (row[header.name] as string).length;
            return 10;
          })
        );

        return Math.max(150, Math.min(500, maxLength * 8));
      }

      return 150;
    }

    return headers.map((header, idx) => ({
      name: header.name || '',
      resizable: true,
      icon: header?.schema?.primaryKey ? (
        <Icon.GreenKey size="sm" />
      ) : undefined,
      initialSize: Math.max(
        header.name.length * 10,
        getInitialSizeByHeaderType(idx, header)
      ),
    }));
  }, [result]);

  const renderCell = useCallback(
    (y: number, x: number) => {
      if (data[y]) {
        return (
          <TableCell
            key={data[y].rowIndex}
            value={data[y].data[headers[x].name]}
            header={headers[x]}
            col={x}
            row={data[y].rowIndex}
            readOnly={!updatableTables[headers[x]?.schema?.table || '']}
          />
        );
      }
      return <></>;
    },
    [data, result, updatableTables, page, pageSize, newRowCount]
  );

  const relativeRemoveRowsIndex = useMemo(() => {
    return removeRowsIndex.map((removeIndex) => {
      return data.findIndex(({ rowIndex }) => rowIndex === removeIndex) ?? 0;
    });
  }, [removeRowsIndex, data]);

  return (
    <div className={styles.container} onContextMenu={handleContextMenu}>
      <OptimizeTable
        headers={headerMemo}
        data={data}
        renderAhead={20}
        renderCell={renderCell}
        rowHeight={35}
        newRowsIndex={newRowsIndex}
        removedRowsIndex={relativeRemoveRowsIndex}
        selectedRowsIndex={selectedRowsIndex}
        onSelectedRowsIndexChanged={handleSelectedRowsChange}
      />
    </div>
  );
}

export default React.memo(QueryResultTable);
