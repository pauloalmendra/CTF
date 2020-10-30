/*
# MSC-26646-1, "Core Flight System Test Framework (CTF)"
#
# Copyright (c) 2019-2020 United States Government as represented by the
# Administrator of the National Aeronautics and Space Administration. All Rights Reserved.
#
# This software is governed by the NASA Open Source Agreement (NOSA) License and may be used,
# distributed and modified only pursuant to the terms of that agreement.
# See the License for the specific language governing permissions and limitations under the
# License at https://software.nasa.gov/ .
#
# Unless required by applicable law or agreed to in writing, software distributed under the
# License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
# either expressed or implied.
*/

import { Button, Divider, Icon, Popover, Tag, Tooltip, Input, InputNumber, Checkbox, message } from 'antd';
import Text from 'antd/lib/typography/Text';
import * as React from 'react';
import { MakeEmptyArgument } from '../../../../domain/builders/MakeEmptyArgument';
import {
    CtfInstruction,
    CtfInstructionArg,
    CtfInstructionData,
    CtfComparisonType,
    CtfTlmArgType,
} from '../../../../model/ctf-file';
import {
    CtfPluginInstruction,
    CtfPluginInstructionParam
} from '../../../../model/ctf-plugin';
import { EditingContext } from '../../../../model/editing-context';
import { VehicleData } from '../../../../model/vehicle-data';
import { AutoCompleteField } from './AutoCompleteField';
import { Comparison } from './Comparison';
import { ParamArray } from './ctf-file-editor-utils';
import { CascaderOptionType } from 'antd/lib/cascader';

const CommandStyle: React.CSSProperties = {
    flex: '1 1 auto',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
};

interface CommandState {
    ctfCommand: CtfInstruction;
    definition: CtfPluginInstruction;
    groupName: string;
    context: EditingContext;
    // if one of the children is a message_id field
    // we want to store that so we can tell the
    // command_code field to filter things down
    cmdMidFilter?: string;
    tlmMidFilter?: string;
    // store cc filter so we can so the appropriate arguments
    ccFilter?: string;
    ccAvailable?: boolean;
    onChange?: (newCommand: CtfInstruction) => void;
}

function setValue(object, path, value): void {
    // console.log(object)
    // console.log(path)
    // console.log(value)
    var keys = path.split('.'),
        last = keys.pop();
    keys.reduce(function (o, k) { return o[k] = o[k] || {}; }, object)[last] = value;
}

export class Command extends React.Component<CommandState, CommandState> {
    constructor(props: CommandState) {
        super(props);
        this.state = Object.assign({}, props);
        if (this.state.definition) {
            // look for initial mid or cmd code
            this.state.definition.parameters.forEach(p => {
                if (!p.isArray && p.type === 'cmd_mid'){
                    this.state = Object.assign({}, this.state, {
                        cmdMidFilter: this.state.ctfCommand.data[
                            p.name
                        ] as string
                    });
                    var command_codes = this.mapVehicleDataToFilteredCommandCodes(
                        this.state.context.vehicleData, this.state.cmdMidFilter);
                    console.log(command_codes)
                    if (command_codes.length == 1){
                        this.state = Object.assign({}, this.state, {
                            ccAvailable: false
                        });
                    }
                    else{
                        this.state = Object.assign({}, this.state, {
                            ccAvailable: true
                        });
                    }
                }
                if (!p.isArray && p.type === 'tlm_mid')
                    this.state = Object.assign({}, this.state, {
                        tlmMidFilter: this.state.ctfCommand.data[
                            p.name
                        ] as string
                    });
                if (!p.isArray && p.type === 'cmd_code')
                    this.state = Object.assign({}, this.state, {
                        ccFilter: this.state.ctfCommand.data[p.name] as string
                    });
            });
        }
    }

    componentWillReceiveProps = (props: CommandState) => {
        this.setState({
            ctfCommand: props.ctfCommand,
            context: props.context,
            onChange: props.onChange
        });
    };

    setValue = (object, path, value) => {
        object[path] = value
    }

    getValue = (object, path) => {
        if (object instanceof Object)
            if (path in object)
                return object[path]
        else
            return object? object : ""
    }

    // update the command when an existing array element changes
    arrayElementChanged = (
        param: CtfPluginInstructionParam,
        value: CtfInstructionArg,
        index: number
    ) => {
        // copy the array, then replace the value
        const updatedArray: CtfInstructionArg[] = Array.from(this.state.ctfCommand
            .data[param.name] as CtfInstructionArg[]);
        updatedArray.splice(index, 1, value);
        // create an object with a key for the array that is the parameter name
        // use assign to replace the existing argument with this name
        const newCommand: CtfInstruction = Object.assign(
            {},
            this.state.ctfCommand,
            {
                data: Object.assign({}, this.state.ctfCommand.data, {
                    [param.name]: updatedArray
                })
            }
        );
        // tell any listeners about the new command
        if (this.state.onChange) this.state.onChange(newCommand);
    };

    // update the command when an existing argument value changes
    argumentChanged = (
        param: CtfPluginInstructionParam,
        value: CtfInstructionArg,
        index: number
    ) => {

        // we ignore index here since it is really only for arrays
        // create an object with a key for the argument that is the parameter name
        const newCommand: CtfInstruction = Object.assign({}, this.state.ctfCommand);
        newCommand.data[param.name] = value;

        // tell any listeners about the new command
        if (param.type === 'cmd_mid') this.cmdMidChanged(value as string);
        else if (param.type === 'tlm_mid') this.tlmMidChanged(value as string);
        else if (param.type === 'cmd_code' && !param.isArray)
            this.ccChanged(value as string);      

        if (this.state.onChange) this.state.onChange(newCommand);
    };

    // update the command when wait is changed
    waitChanged = (
        value: number,
    ) => {
        // we ignore index here since it is really only for arrays
        // create an object with a key for the argument that is the parameter name
        const newCommand: CtfInstruction = Object.assign({}, this.state.ctfCommand);
        newCommand.wait = value;
        // tell any listeners about the new command
        if (this.state.onChange) this.state.onChange(newCommand);
    };


    // handler to listen for cmd_mid field changes
    cmdMidChanged = (newMid: string) => {
        // if the selected mid has only one CC, autoselect it and show an alert
        var command_codes = this.mapVehicleDataToFilteredCommandCodes(
            this.state.context.vehicleData, newMid);

        if (command_codes.length == 1){
            this.setState({ccAvailable: false});
            this.ccChanged(command_codes[0]);
        }
        else{
            this.setState({ccAvailable: true});
        }
        this.setState({ cmdMidFilter: newMid });
    };

    // handler to listen for tlm_mid field changes
    tlmMidChanged = (newMid: string) => {
        this.setState({ tlmMidFilter: newMid });
    };

    // handler to listen for cmd_code field changes
    ccChanged = (newCc: string) => {
        console
        // reset the value of any cmd_arg arrays
        const resetArgs = Object.create({});
        this.state.definition.parameters.map(p => {
            if (p.isArray && p.type === 'cmd_arg') {
                resetArgs[p.name] = Array.from({
                    length: this.mapVehicleDataToFilteredCommandParams(
                        this.state.context.vehicleData,
                        this.state.cmdMidFilter,
                        newCc
                    ).length
                }).map(e => '');
            }
        });
        console.log(this.state.ctfCommand)
        Object.assign(this.state.ctfCommand.data, {cc: newCc})
        console.log(this.state.ctfCommand)
        const newCommand = Object.assign({}, this.state.ctfCommand, {
            data: Object.assign({}, this.state.ctfCommand.data, resetArgs)
        });
        console.log(newCommand)
        if (this.state.onChange) this.state.onChange(newCommand);
        this.setState({ ccFilter: newCc });
    };

    // array argument deleted
    deleteArrayArgument = (param: CtfPluginInstructionParam, index: number) => {
        const newCommand = Object.assign({}, this.state.ctfCommand);
        if (param.isArray) {
            (newCommand.data[param.name] as CtfInstructionArg[]).splice(index, 1);
        }
        if (this.state.onChange) this.state.onChange(newCommand);
    };

    // add array argument
    addArrayArgument = (param: CtfPluginInstructionParam) => {
        const newCommand = Object.assign({}, this.state.ctfCommand);
        if (param.isArray) {
            (newCommand.data[param.name] as CtfInstructionArg[]).push(
                MakeEmptyArgument.make(param)
            );
        }
        if (this.state.onChange) this.state.onChange(newCommand);
    };

    mapVehicleDataToCommandMessageIds(vehicleData: VehicleData): string[] {
        return (
            vehicleData.commands
                .map(cmd => cmd.mid)
                // only distinct elements
                .filter((elem, i, self) => self.indexOf(elem) === i)
        );
    }

    mapVehicleDataToTelemetryMessageIds(vehicleData: VehicleData): string[] {
        return (
            vehicleData.telemetry
                .map(tlm => tlm.mid)
                // only distinct elements
                .filter((elem, i, self) => self.indexOf(elem) === i)
        );
    }

    mapVehicleDataToFilteredTelemetryFields = (
        vehicleData: VehicleData,
        midFilter?: string
    ): string[] => {
        return vehicleData.telemetry.filter(t => t.mid == midFilter)
            .map(t => t.params.filter(p => p !== undefined).map(p => p.name).flat())
            .flat();
    };

    // extract and filter command codes by command mid
    mapVehicleDataToFilteredCommandCodes(
        vehicleData: VehicleData,
        midFilter?: string
    ): string[] {
        return vehicleData.commands
            .filter(cmd => midFilter === undefined || midFilter === cmd.mid)
            .map(cmd => cmd.cc);
    }

    mapVehicleDataToFilteredCommandParams(
        vehicleData: VehicleData,
        midFilter?: string,
        ccFilter?: string
    ): string[] {
        return vehicleData.commands
            .filter(cmd => cmd.mid === midFilter && cmd.cc === ccFilter)
            .map(cmd => cmd.params.map(p => p.name))
            .flat();
    }

    // filters by param name or index
    mapVehicleDataToFilteredCommandEnums(
        vehicleData: VehicleData,
        midFilter?: string,
        ccFilter?: string,
        param?: string | number
    ): string[] {
        return vehicleData.commands
            .filter(cmd => cmd.mid === midFilter && cmd.cc === ccFilter)
            .map(cmd => {
                cmd.params
                    .filter((p, i) =>
                        typeof param === 'string'
                            ? p.name === param
                            : i === param
                    )
                    .map(p => { if (p.enum) p.enum.map(e => e.label); else return [] })
                    .flat()
            })
            .flat();
    }
    
    mapObjectsToCascaderOptions(obj) : CascaderOptionType[] {
        var options: CascaderOptionType[] = [];
        const iterate = (obj: CascaderOptionType, prefix): CascaderOptionType[] => {
                var new_options: CascaderOptionType[] = [];
                Object.keys(obj).forEach(key => {
                var option: CascaderOptionType = {label: key, value: prefix + '.' + key}
                if (typeof obj[key] === 'object') {
                    new_options.push({label: key, value: key, children: iterate(obj[key], prefix + '.' + key)})
                }
                else{
                    var option: CascaderOptionType = {label: key, value: prefix + '.' + key}
                    new_options.push(option)       
                }
            })
                return new_options
        }
        Object.keys(obj).forEach(key => {
            var option = iterate(obj[key], key)
            options.push({label: key, value: key, children: option});
        }) 
        return options
    }

    mapDotNotationToCascaderOptions = (
        values: string[]
    ): CascaderOptionType[] => {
        var options_dict : Object = {};
        values.forEach(value =>{
            var pieces = value.split(".");
            setValue(options_dict, value, pieces[pieces.length - 1])
        })
        var options: CascaderOptionType[] = this.mapObjectsToCascaderOptions(options_dict)
        console.log(options)
        return options
    };
    // Index parameter is index of argument in param array
    // Index is 0 if argument is not an array
    renderArgument = (
        param: CtfPluginInstructionParam,
        value: CtfInstructionArg,
        context: EditingContext,
        index: number,
        fillWidth: boolean,
        onChange: (
            param: CtfPluginInstructionParam,
            value: CtfInstructionArg,
            index: number
        ) => void
    ) => {
        const dataSource = [
            {
                label: 'Parameters',
                value: 'Parameters',
                children: context.parameters.map(v => ({ label: v, value: v }))
            },
            {
                label: 'Variables',
                value: 'Variables',
                children: context.variables.map(v => ({ label: v, value: v }))
            }
        ];

        const style = fillWidth
            ? { display: 'block' }
            : { display: 'inline-block' };

        if (param.type === 'comparison') {
            return (
                <Comparison
                    style={style}
                    comparison={value as CtfComparisonType}
                    context={context}
                    tlmMid={this.state.tlmMidFilter}
                    onChange={value => {
                        onChange(param, value, index);
                    }}
                />
            );
        } else if (param.type === 'cmd_mid') {
            return (
                <AutoCompleteField
                    title={param.name}
                    style={style}
                    defaultValue={value}
                    dataSource={[
                        {
                            label: 'Command MIDs',
                            value: 'Command MIDs',
                            children: this.mapVehicleDataToCommandMessageIds(
                                context.vehicleData
                            ).map(m => ({ label: m, value: m }))
                        }
                    ].concat(dataSource)}
                    onChange={value => {
                        onChange(param, value, index);
                    }}
                />
            );
        } else if (param.type === 'tlm_mid') {
            return (
                <AutoCompleteField
                    title={param.name}
                    style={style}
                    defaultValue={value}
                    dataSource={[
                        {
                            label: 'Telemetry MIDs',
                            value: 'Telemetry MIDs',
                            children: this.mapVehicleDataToTelemetryMessageIds(
                                context.vehicleData
                            ).map(m => ({ label: m, value: m }))
                        }
                    ].concat(dataSource)}
                    onChange={value => {
                        onChange(param, value, index);
                    }}
                />
            );
        } else if (param.type === 'cmd_code') {
                return (
                    <AutoCompleteField
                        title={param.name}
                        style={this.state.ccAvailable? style: {display: "none"}}
                        defaultValue={value}
                        dataSource={[
                            {
                                label: 'Command Codes',
                                value: 'Command Codes',
                                children: this.mapVehicleDataToFilteredCommandCodes(
                                    context.vehicleData,
                                    this.state.cmdMidFilter
                                ).map(c => ({ label: c, value: c }))
                            }
                        ].concat(dataSource)}
                        onChange={value => {
                            onChange(param, value, index);
                        }}
                    />
                );
        } else if (param.type === 'tlm_field') {
            return (
                <AutoCompleteField
                    title={param.name}
                    style={style}
                    defaultValue={value}
                    dataSource={[
                        {
                            label: 'Telemetry Fields',
                            value: 'Telemetry Fields',
                            children: this.mapDotNotationToCascaderOptions(this.mapVehicleDataToFilteredTelemetryFields(
                                context.vehicleData,
                                this.state.tlmMidFilter
                            ))
                        }
                    ].concat(dataSource)}
                    onChange={value => {
                        onChange(param, value, index);
                    }}
                />
            );
        } else if (param.type === 'cmd_arg') {
            const cmdParamName = this.mapVehicleDataToFilteredCommandParams(
                context.vehicleData,
                this.state.cmdMidFilter,
                this.state.ccFilter
            )[index];
            var cmd_arg_obj = {}
            if (!(value instanceof Object)){
                this.setValue(cmd_arg_obj, cmdParamName, value);
                onChange(param, cmd_arg_obj, index);
            }
            else{
                cmd_arg_obj = value;
            }
            return (
                <AutoCompleteField
                    title={cmdParamName}
                    style={style}
                    defaultValue={this.getValue(cmd_arg_obj, cmdParamName)}
                    dataSource={[
                        {
                            label: 'Enumerations',
                            value: 'Enumerations',
                            children: this.mapVehicleDataToFilteredCommandEnums(
                                context.vehicleData,
                                this.state.cmdMidFilter,
                                this.state.ccFilter,
                                cmdParamName
                            ).map(c => {return ({ label: c, value: c }) }
                            ).filter(c => c.label ? true : false)
                        }
                    ].concat(dataSource)}
                    onChange={value => {
                        const inputValue = value.length == 0? value : 
                                            (isNaN(Number(value)) ? value : Number(value));
                        this.setValue(cmd_arg_obj, cmdParamName, inputValue)
                        onChange(param, cmd_arg_obj, index)
                    }}
                />
            );
        } else if (param.type === 'tlm_arg') {
            return (
                <div>
                    <Input.Group compact>
                        <AutoCompleteField
                            dataSource={[
                                {
                                    label: 'Telemetry Fields',
                                    value: 'Telemetry Fields',
                                    children: this.mapDotNotationToCascaderOptions(this.mapVehicleDataToFilteredTelemetryFields(
                                        context.vehicleData,
                                        this.state.tlmMidFilter
                                    ))
                                }
                            ].concat(dataSource)}
                            placeholder=""
                            defaultValue={
                                (value as CtfTlmArgType).variable
                            }
                            onChange={v => {
                                const newValue =
                                    { variable: v, value: (value as CtfTlmArgType).value };
                                if (onChange) onChange(param, newValue, index);
                            }}
                        />
                        <AutoCompleteField
                            dataSource={dataSource}
                            placeholder=""
                            defaultValue={
                                (value as CtfTlmArgType).value
                            }
                            onChange={v => {
                                const newValue =
                                {
                                    variable: (value as CtfTlmArgType).variable,
                                    value: isNaN(Number(v)) ? v : Number(v)
                                };
                                if (onChange) onChange(param, newValue, index);
                            }}
                        />
                    </Input.Group>
                </div>
            );
        }
        else if (param.type == "boolean"){
            return (
                <span className="ant-input-wrapper ant-input-group">
                    <span className="ant-input-group-addon">{param.name}
                </span>
                <Checkbox
                    defaultChecked = {value? true: false}
                    value = {value? true: false}
                    onChange={v => {
                        var new_value = v.target.checked;
                        if (onChange) onChange(param, new_value, index);
                    }}
                    className={"ant-input"}
                    style={{paddingLeft:5, paddingTop:5}}
                />
                </span>
            )
        }
        else {
            return (
                <AutoCompleteField
                    title={param.name}
                    style={style}
                    defaultValue={value}
                    dataSource={dataSource}
                    onChange={v => {
                        var newValue = ""
                        if (v.length > 0)
                            newValue = isNaN(Number(v)) ? v : Number(v);;
                        if (onChange) onChange(param, newValue, index);
                    }}
                />
            );
        }
    };

    // Render the arguments as either arrays or regular
    renderArguments(params: CtfPluginInstructionParam[], data: CtfInstructionData) {
        return Object.keys(data).map(paramName => {
            const param = params.filter(p => p.name === paramName)[0];
            if (param === undefined || param === null) {
                return;
            }
            if (param.isArray) {
                if (param.type === 'cmd_arg') {
                    // show only the possible args (fixed length array)
                    const cmdParamNames = this.mapVehicleDataToFilteredCommandParams(
                        this.state.context.vehicleData,
                        this.state.cmdMidFilter,
                        this.state.ccFilter
                    );
                    if (data[param.name] as CtfInstructionArg[]){
                        if (
                            (data[param.name] as CtfInstructionArg[]).length !==
                            cmdParamNames.length
                        ) {
                            data[paramName] = cmdParamNames.map((name, i) => {
                                var dict = {}
                                this.setValue(dict, name, "")
                            })
                        }
                    
                    const valueArray = data[paramName] as CtfInstructionArg[];
                        return (
                            <ParamArray name={paramName}>
                                {cmdParamNames.map((name, i) => (
                                    <div key={i}>
                                        {this.renderArgument(
                                            param,
                                            valueArray[i],
                                            this.state.context,
                                            i,
                                            true,
                                            this.arrayElementChanged
                                        )}
                                    </div>
                                ))}
                            </ParamArray>
                        );
                                    }
                } else {
                    // normal editable length array
                    return (
                        <ParamArray name={paramName}>
                            {(data[paramName] as CtfInstructionArg[]).map(
                                (arrayElem, i) => (
                                    <div key={i}>
                                        {this.renderArgument(
                                            param,
                                            arrayElem,
                                            this.state.context,
                                            i,
                                            false,
                                            this.arrayElementChanged
                                        )}
                                        <Button
                                            type="link"
                                            onClick={e => {
                                                this.deleteArrayArgument(
                                                    param,
                                                    i
                                                );
                                            }}
                                        >
                                            <Icon type="delete" />
                                        </Button>
                                    </div>
                                )
                            )}
                            <Button
                                type="dashed"
                                onClick={e => {
                                    this.addArrayArgument(param);
                                }}
                                block
                            >
                                ADD ARGUMENT
                                <Icon type="plus" />
                            </Button>
                        </ParamArray>
                    );
                }
            } else {
                return (
                    <div>
                        {this.renderArgument(
                            param,
                            data[paramName] != undefined ? data[paramName]: "" as CtfInstructionArg,
                            this.state.context,
                            0,
                            true,
                            this.argumentChanged
                        )}
                    </div>
                );
            }
        });
    }

    render() {
        const { ctfCommand, definition, groupName, context } = this.state;
        if (this.state.definition) {
            return (
                <div style={CommandStyle}>
                    <Tooltip
                        placement="top"
                        title={`Delay before running this instruction`}
                    >
                        <InputNumber
                            defaultValue={ctfCommand.wait}
                            onChange={num => {
                                if (this.waitChanged)
                                    this.waitChanged(num);
                            }}
                            size="small"
                            step={0.1}
                            min={0}
                        />
                    </Tooltip>
                    <Divider type="vertical" />
                    <Popover
                        placement="rightTop"
                        title="Arguments"
                        trigger="click"
                        content=
                        {
                           ctfCommand.data?
                            this.renderArguments(definition.parameters, ctfCommand.data)
                            : []
                        }
                    >
                        <Button style={{ minWidth: 150 }}>
                            {ctfCommand.instruction}
                        </Button>
                        <Tag
                            color="blue"
                            style={{
                                textTransform: 'uppercase',
                                fontSize: '0.75em',
                                marginLeft: 10
                            }}
                        >
                            {groupName}
                        </Tag>
                    </Popover>
                    <span>
                        {definition.parameters.map(
                            (param: CtfPluginInstructionParam) => (
                                (param && ctfCommand.data)?
                                <span key={param.name}>
                                    <Divider type="vertical" />
                                    <Text type="secondary">
                                        {param.name} ={' '}
                                        {JSON.stringify(
                                            ctfCommand.data[param.name]
                                        )}
                                    </Text>
                                </span>
                                :
                                <span></span>
                            )
                        )}
                    </span>
                </div>
            );
        } else {
            return (
                <div style={CommandStyle}>
                    <Tooltip
                        placement="right"
                        title={`Unable to resolve ${this.state.ctfCommand.instruction}`}
                    >
                        <Button
                            icon="warning"
                            style={{ minWidth: 150 }}
                        >
                            {this.state.ctfCommand.instruction}
                        </Button>
                    </Tooltip>
                </div>
            );
        }
    }
}