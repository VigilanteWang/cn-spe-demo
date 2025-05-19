import React, { useEffect, useState } from 'react';
import {
    Button,
    Dialog, DialogActions, DialogContent, DialogSurface, DialogBody, DialogTitle, DialogTrigger,
    Dropdown, Option,
    Input, InputProps, InputOnChangeData,
    Label,
    Spinner,
    makeStyles, shorthands, useId
} from '@fluentui/react-components';
import type {
    OptionOnSelectData,
    SelectionEvents
} from '@fluentui/react-combobox'
import { IContainer } from "./../common/IContainer";
import SpEmbedded from '../services/spembedded';

const spe = new SpEmbedded();

const useStyles = makeStyles({
    root: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...shorthands.padding('25px'),
    },
    containerSelector: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        rowGap: '10px',
        ...shorthands.padding('25px'),
    },
    containerSelectorControls: {
        width: '400px',
    },
    dialogContent: {
        display: 'flex',
        flexDirection: 'column',
        rowGap: '10px',
        marginBottom: '25px'
    }
});

export const Containers = (props: any) => {
    const [containers, setContainers] = useState<IContainer[]>([]);
    const [selectedContainer, setSelectedContainer] = useState<IContainer | undefined>(undefined);
    const containerSelector = useId('containerSelector');
    // BOOKMARK 1 - constants & hooks
    useEffect(() => {
        (async () => {
            const containers = await spe.listContainers();
            if (containers) {
                setContainers(containers);
            }
        })();
    }, []);
    const onContainerDropdownChange = (event: SelectionEvents, data: OptionOnSelectData) => {
        const selected = containers.find((container) => container.id === data.optionValue);
        setSelectedContainer(selected);
    };
    // BOOKMARK 2 - handlers go here

    // BOOKMARK 3 - component rendering
    const styles = useStyles();
    return (
        <div className={styles.root}>
            <div className={styles.containerSelector}>
                <Dropdown
                    id={containerSelector}
                    placeholder="Select a Storage Container"
                    className={styles.containerSelectorControls}
                    onOptionSelect={onContainerDropdownChange}>
                    {containers.map((option) => (
                        <Option key={option.id} value={option.id}>{option.displayName}</Option>
                    ))}
                </Dropdown>
            </div>
            {selectedContainer && (`[[TOOD]] container "${selectedContainer.displayName}" contents go here`)}
        </div>
    );
}

export default Containers;